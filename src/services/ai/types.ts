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
  | "context-overflow"
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

/**
 * One result the provider's own search tool actually returned.
 *
 * This is the ground truth for "which URLs exist". The model never adds to it —
 * a URL that is not in this list did not come from a search, and rule 8 says it
 * does not ship.
 */
export interface WebSearchHit {
  url: string;
  title: string;
  /** The provider's relative age string, e.g. "6 hours ago". Null when absent. */
  pageAge: string | null;
}

export interface WebSearchRequest extends CompletionRequest {
  /** Max searches the model may run for this request. */
  maxSearches?: number;
}

export interface WebSearchResponse extends CompletionResult {
  /** Every URL the search tool returned, across every search it ran. */
  hits: WebSearchHit[];
  /** How many searches the tool actually performed. */
  searchCount: number;
  /** Set when the tool itself errored, e.g. `max_uses_exceeded`. */
  toolError: string | null;
}

export interface AIProvider {
  readonly name: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
  /** Whether this provider can run the web search server tool. */
  searchCapability(): { supported: boolean };
  /**
   * One completion with the provider's own web search tool attached. Present
   * only when `searchCapability().supported` is true.
   */
  webSearch?(req: WebSearchRequest): Promise<WebSearchResponse>;
}
