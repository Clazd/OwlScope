import "server-only";
import { z } from "zod";
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
  input?: unknown;
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

function categorise(status: number, detail = ""): ErrorCategory {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate-limit";
  if (status === 413 || (status === 400 && /context|too many tokens|prompt is too long/i.test(detail))) return "context-overflow";
  return "http";
}

/** 429 and 5xx are worth another go. 4xx means the request itself is wrong. */
function isRetryable(category: ErrorCategory, status?: number): boolean {
  if (category === "network" || category === "timeout" || category === "rate-limit" || category === "parse") return true;
  return category === "http" && status !== undefined && status >= 500;
}

function isDeepSeekEndpoint(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === "api.deepseek.com";
  } catch {
    return false;
  }
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
    toolChoice?: ServerTool;
    thinking?: { type: "disabled" };
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
      ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}),
      ...(options.thinking ? { thinking: options.thinking } : {}),
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
      const category = categorise(response.status, detail);
      const message = category === "context-overflow"
        ? `${req.stage} exceeded the model context. Reduce the topic, memory, or evidence and retry.`
        : `Provider returned ${response.status} for ${req.stage}.`;
      throw new ProviderError(category, message, {
        status: response.status,
        detail,
      });
    }

    const rawBody = await response.text();
    let payload: AnthropicMessage;
    try {
      payload = JSON.parse(rawBody) as AnthropicMessage;
    } catch (err) {
      throw new ProviderError("parse", "Provider returned a body that is not JSON.", {
        detail: rawBody.slice(0, 800) || "The response body was empty.",
        cause: err,
      });
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

  /**
   * Bounded retries, and only on failures that are safe to repeat. A completion
   * has no side effects on our side, so replaying one is always idempotent.
   */
  async function callWithRetry(req: CompletionRequest, model: string, options: CallOptions = {}): Promise<RawCall> {
    let lastError: ProviderError | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await callRaw(req, model, options);
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

  async function complete(req: CompletionRequest): Promise<CompletionResult> {
    const model = modelFor(req.tier);
    const options: CallOptions = isDeepSeekEndpoint(config.baseUrl)
      ? { thinking: { type: "disabled" } }
      : {};
    return (await callWithRetry(req, model, options)).result;
  }

  async function completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const instruction =
      `${req.prompt}\n\n` +
      `Reply with a single JSON value matching ${req.schemaName}. ` +
      `No prose, no code fence, no commentary.`;

    // DeepSeek V4 defaults to high-effort thinking. That is useful for open-ended
    // reasoning, but wasteful for schema-bound stages and can exhaust the output
    // budget before a final JSON answer appears. Its Anthropic-compatible API
    // supports forced tool input, which gives us typed data directly and avoids
    // asking the model to serialize JSON text at all.
    if (isDeepSeekEndpoint(config.baseUrl)) {
      return completeDeepSeekStructured(req, instruction);
    }

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

  async function completeDeepSeekStructured<T>(
    req: StructuredRequest<T>,
    instruction: string,
  ): Promise<StructuredResult<T>> {
    const model = modelFor(req.tier);
    const toolName = "return_structured_output";
    const options: CallOptions = {
      thinking: { type: "disabled" },
      tools: [{
        name: toolName,
        description: `Return the requested ${req.schemaName} value.`,
        input_schema: z.toJSONSchema(req.schema),
      }],
      toolChoice: { type: "tool", name: toolName },
    };

    const first = await callWithRetry({ ...req, prompt: instruction }, model, options);
    const firstAttempt = validateStructuredPayload(req, first, toolName);
    if (firstAttempt.validated.ok) {
      return {
        ...first.result,
        text: firstAttempt.text,
        data: firstAttempt.validated.data,
        repaired: false,
      };
    }

    log.warn(`${req.stage} failed validation; attempting one repair`);
    const repairPrompt =
      `${instruction}\n\n` +
      `Your previous reply did not validate against ${req.schemaName}.\n` +
      `Previous reply:\n${firstAttempt.text}\n\n` +
      `Problems: ${firstAttempt.validated.error}\n\n` +
      `Call ${toolName} once with corrected input.`;
    const second = await callWithRetry({ ...req, prompt: repairPrompt }, model, options);
    const secondAttempt = validateStructuredPayload(req, second, toolName);
    const merged: CompletionResult = {
      ...second.result,
      text: secondAttempt.text,
      prompt: instruction,
      tokensIn: first.result.tokensIn + second.result.tokensIn,
      tokensOut: first.result.tokensOut + second.result.tokensOut,
      latencyMs: first.result.latencyMs + second.result.latencyMs,
      costEstimate: first.result.costEstimate + second.result.costEstimate,
    };

    if (!secondAttempt.validated.ok) {
      throw new ProviderError("schema", `${req.stage} did not return valid ${req.schemaName}.`, {
        detail: `${secondAttempt.validated.error}; received: ${secondAttempt.text.slice(0, 1000)}`,
      });
    }
    return { ...merged, data: secondAttempt.validated.data, repaired: true };
  }

  function validateStructuredPayload<T>(
    req: StructuredRequest<T>,
    raw: RawCall,
    toolName: string,
  ): { text: string; validated: Validated<T> } {
    const toolUses = raw.payload.content?.filter(
      (block) => block.type === "tool_use" && block.name === toolName,
    ) ?? [];
    if (toolUses.length > 0) {
      const inputs = toolUses.map((block) => block.input ?? null);
      for (const input of inputs) {
        const candidates: unknown[] = [input];
        if (input && typeof input === "object" && !Array.isArray(input)) {
          const object = input as Record<string, unknown>;
          for (const key of ["output", "result", "data", req.schemaName]) {
            if (key in object) candidates.push(object[key]);
          }
        }
        for (const candidate of candidates) {
          const validated = validateValue(req, candidate);
          if (validated.ok) return { text: JSON.stringify(candidate), validated };
        }
      }
      const text = JSON.stringify(inputs.length === 1 ? inputs[0] : inputs);
      return { text, validated: validateValue(req, inputs.at(-1)) };
    }
    return { text: raw.result.text, validated: validate(req, raw.result.text) };
  }

  function modelFor(tier: ModelTier): string {
    const model = config.models[tier];
    if (!model) throw new ProviderError("config", `No ${tier} model configured. Set it in Settings.`);
    return model;
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
    const model = modelFor(req.tier);

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
  return validateValue(req, value);
}

function validateValue<T>(req: StructuredRequest<T>, value: unknown): Validated<T> {
  const result = req.schema.safeParse(value);
  if (!result.success) return { ok: false, error: describeIssues(result.error.issues) };
  return { ok: true, data: result.data };
}
