import "server-only";
import { createLogger } from "@/lib/logging/log";
import { describeIssues, extractJson } from "@/lib/validation/json";
import { estimateCost } from "./pricing";
import {
  ProviderError,
  type AIProvider,
  type CompletionRequest,
  type CompletionResult,
  type ErrorCategory,
  type ModelTier,
  type StructuredRequest,
  type StructuredResult,
  type WebSearchHit,
  type WebSearchRequest,
  type WebSearchResponse,
} from "./types";

const log = createLogger("ai/anthropic");

const API_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 1024;
const MAX_ATTEMPTS = 3;
/** How many times a paused server-tool turn may be resumed before giving up. */
const MAX_SEARCH_CONTINUATIONS = 3;

export interface AnthropicConfig {
  apiKey: string;
  baseUrl: string;
  models: Record<ModelTier, string>;
}

/** One entry inside a `web_search_tool_result` block's content array. */
interface AnthropicSearchResult {
  type?: string;
  url?: string;
  title?: string;
  page_age?: string | null;
}

interface AnthropicBlock {
  type: string;
  text?: string;
  /** On `web_search_tool_result`: the result list, or an error object. */
  content?: AnthropicSearchResult[] | { type?: string; error_code?: string };
  name?: string;
}

interface AnthropicMessage {
  content?: AnthropicBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  stop_reason?: string;
}

/** A tool definition as the API expects it. Only server tools are used here. */
type ServerTool = Record<string, unknown>;

/**
 * Dynamic-filtering web search runs on the current model families and falls
 * back to the basic tool everywhere else. Getting this wrong is a 400 rather
 * than a silent degradation, so the list is explicit rather than a guess.
 */
const DYNAMIC_SEARCH_MODELS = [
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-fable-5",
  "claude-mythos-5",
];

export function webSearchToolType(model: string): string {
  const name = model.toLowerCase();
  return DYNAMIC_SEARCH_MODELS.some((m) => name.startsWith(m))
    ? "web_search_20260209"
    : "web_search_20250305";
}

function categorise(status: number): ErrorCategory {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate-limit";
  return "http";
}

/** 429 and 5xx are worth another go. 4xx means the request itself is wrong. */
function isRetryable(category: ErrorCategory, status?: number): boolean {
  if (category === "network" || category === "timeout" || category === "rate-limit") return true;
  return category === "http" && status !== undefined && status >= 500;
}

const backoffMs = (attempt: number) => Math.min(8_000, 500 * 2 ** (attempt - 1));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createAnthropicProvider(config: AnthropicConfig): AIProvider {
  if (!config.apiKey) {
    throw new ProviderError("config", "No AI_API_KEY is set. Add it to .env, or turn on sandbox mode.");
  }

  interface RawCall {
    result: CompletionResult;
    /** Kept so the caller can read tool-result blocks the text join drops. */
    payload: AnthropicMessage;
  }

  interface CallOptions {
    tools?: ServerTool[];
    /** Overrides the single-user-turn default, for resuming a paused turn. */
    messages?: Array<{ role: string; content: unknown }>;
  }

  async function callRaw(req: CompletionRequest, model: string, options: CallOptions = {}): Promise<RawCall> {
    const started = Date.now();
    const body = {
      model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: req.temperature ?? 1,
      ...(req.system ? { system: req.system } : {}),
      ...(options.tools ? { tools: options.tools } : {}),
      messages: options.messages ?? [{ role: "user", content: req.prompt }],
    };

    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (err) {
      const name = (err as Error).name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new ProviderError(
          "timeout",
          `${req.stage} timed out after ${(req.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000}s.`,
          { cause: err },
        );
      }
      throw new ProviderError("network", `Could not reach the provider: ${(err as Error).message}`, { cause: err });
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 800);
      const category = categorise(response.status);
      throw new ProviderError(category, `Provider returned ${response.status} for ${req.stage}.`, {
        status: response.status,
        detail,
      });
    }

    let payload: AnthropicMessage;
    try {
      payload = (await response.json()) as AnthropicMessage;
    } catch (err) {
      throw new ProviderError("parse", "Provider returned a body that is not JSON.", { cause: err });
    }

    const text = (payload.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");

    const tokensIn = payload.usage?.input_tokens ?? 0;
    const tokensOut = payload.usage?.output_tokens ?? 0;
    const usedModel = payload.model ?? model;

    return {
      result: {
        text,
        prompt: req.prompt,
        system: req.system,
        tokensIn,
        tokensOut,
        latencyMs: Date.now() - started,
        model: usedModel,
        costEstimate: estimateCost(usedModel, tokensIn, tokensOut),
        sandbox: false,
      },
      payload,
    };
  }

  async function callOnce(req: CompletionRequest, model: string): Promise<CompletionResult> {
    return (await callRaw(req, model)).result;
  }

  /**
   * Bounded retries, and only on failures that are safe to repeat. A completion
   * has no side effects on our side, so replaying one is always idempotent.
   */
  async function complete(req: CompletionRequest): Promise<CompletionResult> {
    const model = config.models[req.tier];
    if (!model) {
      throw new ProviderError("config", `No ${req.tier} model configured. Set it in Settings.`);
    }

    let lastError: ProviderError | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await callOnce(req, model);
      } catch (err) {
        const error = err instanceof ProviderError ? err : new ProviderError("unknown", (err as Error).message, { cause: err });
        lastError = error;
        if (attempt === MAX_ATTEMPTS || !isRetryable(error.category, error.status)) break;
        log.warn(`${req.stage} attempt ${attempt} failed (${error.category}); retrying`);
        await sleep(backoffMs(attempt));
      }
    }
    throw lastError ?? new ProviderError("unknown", `${req.stage} failed for an unknown reason.`);
  }

  async function completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const instruction =
      `${req.prompt}\n\n` +
      `Reply with a single JSON value matching ${req.schemaName}. ` +
      `No prose, no code fence, no commentary.`;

    const first = await complete({ ...req, prompt: instruction });
    const firstAttempt = validate(req, first.text);
    if (firstAttempt.ok) {
      return { ...first, data: firstAttempt.data, repaired: false };
    }

    // Exactly one repair pass, with the validation error fed back, then a clean
    // loud failure. Two repair passes is how a cheap app becomes an expensive one.
    log.warn(`${req.stage} failed validation; attempting one repair`);
    const repairPrompt =
      `${instruction}\n\n` +
      `Your previous reply did not validate against ${req.schemaName}.\n` +
      `Previous reply:\n${first.text}\n\n` +
      `Problems: ${firstAttempt.error}\n\n` +
      `Return only corrected JSON.`;

    const second = await complete({ ...req, prompt: repairPrompt });
    const secondAttempt = validate(req, second.text);

    const merged: CompletionResult = {
      ...second,
      prompt: instruction,
      tokensIn: first.tokensIn + second.tokensIn,
      tokensOut: first.tokensOut + second.tokensOut,
      latencyMs: first.latencyMs + second.latencyMs,
      costEstimate: first.costEstimate + second.costEstimate,
    };

    if (!secondAttempt.ok) {
      throw new ProviderError("schema", `${req.stage} did not return valid ${req.schemaName}.`, {
        detail: secondAttempt.error,
      });
    }
    return { ...merged, data: secondAttempt.data, repaired: true };
  }

  /**
   * One completion with the web search server tool attached.
   *
   * The search runs on Anthropic's side and is billed through the existing
   * key — there is no second secret and no search vendor to sign up with.
   *
   * What comes back is deliberately split in two: `hits` are the URLs the
   * search tool itself returned, and `text` is whatever the model wrote about
   * them. Callers treat the first as fact and the second as claims, which is
   * how a model-invented URL gets caught instead of shipped.
   */
  async function webSearch(req: WebSearchRequest): Promise<WebSearchResponse> {
    const model = config.models[req.tier];
    if (!model) {
      throw new ProviderError("config", `No ${req.tier} model configured. Set it in Settings.`);
    }

    const tools: ServerTool[] = [
      {
        type: webSearchToolType(model),
        name: "web_search",
        ...(req.maxSearches ? { max_uses: req.maxSearches } : {}),
      },
    ];

    const hits: WebSearchHit[] = [];
    const seen = new Set<string>();
    const texts: string[] = [];
    let searchCount = 0;
    let toolError: string | null = null;
    let tokensIn = 0;
    let tokensOut = 0;
    let latencyMs = 0;
    let costEstimate = 0;
    let usedModel = model;

    // The server runs its own sampling loop and pauses at its iteration limit.
    // Resuming is just re-sending the assistant turn; the cap stops a runaway
    // search from quietly becoming an expensive one.
    const messages: Array<{ role: string; content: unknown }> = [
      { role: "user", content: req.prompt },
    ];

    for (let turn = 0; turn <= MAX_SEARCH_CONTINUATIONS; turn += 1) {
      const { result, payload } = await callRaw(req, model, { tools, messages });

      tokensIn += result.tokensIn;
      tokensOut += result.tokensOut;
      latencyMs += result.latencyMs;
      costEstimate += result.costEstimate;
      usedModel = result.model;
      if (result.text) texts.push(result.text);

      for (const block of payload.content ?? []) {
        if (block.type === "server_tool_use" && block.name === "web_search") {
          searchCount += 1;
          continue;
        }
        if (block.type !== "web_search_tool_result") continue;
        const content = block.content;
        // A tool error is an object, a success is a list. Branch before indexing.
        if (!Array.isArray(content)) {
          toolError = content?.error_code ?? "unknown";
          continue;
        }
        for (const entry of content) {
          if (entry.type !== "web_search_result" || !entry.url) continue;
          if (seen.has(entry.url)) continue;
          seen.add(entry.url);
          hits.push({ url: entry.url, title: entry.title ?? entry.url, pageAge: entry.page_age ?? null });
        }
      }

      if (payload.stop_reason !== "pause_turn") break;
      // No "continue" message: the trailing server_tool_use tells the API to resume.
      messages.push({ role: "assistant", content: payload.content ?? [] });
      log.debug(`${req.stage} paused after ${searchCount} searches; resuming`);
    }

    return {
      text: texts.join("\n"),
      prompt: req.prompt,
      system: req.system,
      hits,
      searchCount,
      toolError,
      tokensIn,
      tokensOut,
      latencyMs,
      model: usedModel,
      costEstimate,
      sandbox: false,
    };
  }

  return {
    name: "anthropic",
    complete,
    completeStructured,
    webSearch,
    searchCapability: () => ({ supported: true }),
  };
}

type Validated<T> = { ok: true; data: T } | { ok: false; error: string };

export function validate<T>(req: StructuredRequest<T>, text: string): Validated<T> {
  let value: unknown;
  try {
    value = extractJson(text);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const result = req.schema.safeParse(value);
  if (!result.success) return { ok: false, error: describeIssues(result.error.issues) };
  return { ok: true, data: result.data };
}
