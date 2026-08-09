import type { ZodType } from "zod";

/** Which of the two configured models a stage should use. */
export type ModelTier = "strong" | "fast";

/**
 * Every failure the provider can produce, named. Stage failures are logged with
 * one of these so the Inspector can say what went wrong without guessing.
 */
export type ErrorCategory =
  | "config"
  | "auth"
  | "timeout"
  | "network"
  | "rate-limit"
  | "http"
  | "parse"
  | "schema"
  | "fixture-missing"
  | "unknown";

export class ProviderError extends Error {
  readonly category: ErrorCategory;
  readonly status?: number;
  readonly detail?: string;

  constructor(category: ErrorCategory, message: string, opts?: { status?: number; detail?: string; cause?: unknown }) {
    super(message, { cause: opts?.cause });
    this.name = "ProviderError";
    this.category = category;
    this.status = opts?.status;
    this.detail = opts?.detail;
  }
}

export interface CompletionRequest {
  /** Pipeline stage name. Also selects the fixture folder in sandbox mode. */
  stage: string;
  tier: ModelTier;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Fixture case name under `/fixtures/<stage>/`. Defaults to `default`. */
  fixtureCase?: string;
}

export interface StructuredRequest<T> extends CompletionRequest {
  schema: ZodType<T>;
  /** Used in the prompt and in error text, e.g. "TopicCandidate". */
  schemaName: string;
}

/** Operational metadata carried by every result, real or fixture. */
export interface Usage {
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  model: string;
  costEstimate: number;
  /** True when the result came from `/fixtures`, not the network. */
  sandbox: boolean;
}

export interface CompletionResult extends Usage {
  text: string;
  /** The exact prompt sent, kept so the Inspector shows what actually ran. */
  prompt: string;
  system?: string;
}

export interface StructuredResult<T> extends CompletionResult {
  data: T;
  /** True when the first response failed validation and a repair pass fixed it. */
  repaired: boolean;
}

export interface AIProvider {
  readonly name: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
  /** Whether this provider can do its own web search. Stubbed false in slice 1. */
  searchCapability(): { supported: boolean };
}
