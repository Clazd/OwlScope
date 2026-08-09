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
} from "./types";

const log = createLogger("ai/anthropic");

const API_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 1024;
const MAX_ATTEMPTS = 3;

export interface AnthropicConfig {
  apiKey: string;
  baseUrl: string;
  models: Record<ModelTier, string>;
}

interface AnthropicMessage {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
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

  async function callOnce(req: CompletionRequest, model: string): Promise<CompletionResult> {
    const started = Date.now();
    const body = {
      model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: req.temperature ?? 1,
      ...(req.system ? { system: req.system } : {}),
      messages: [{ role: "user", content: req.prompt }],
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
      text,
      prompt: req.prompt,
      system: req.system,
      tokensIn,
      tokensOut,
      latencyMs: Date.now() - started,
      model: usedModel,
      costEstimate: estimateCost(usedModel, tokensIn, tokensOut),
      sandbox: false,
    };
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

  return {
    name: "anthropic",
    complete,
    completeStructured,
    // No web search in slice 1. The interface exists so slice 3 has somewhere
    // to put it, not so three providers ship now.
    searchCapability: () => ({ supported: false }),
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
