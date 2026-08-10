/**
 * Structured domain errors. Every code maps to an HTTP status and a stable
 * string that callers can match without parsing prose.
 *
 * Route handlers catch `DomainError` and return its code/message in the JSON
 * response body. Callers that handle errors programmatically match on `code`
 * rather than parsing `message`.
 */

export type ErrorCode =
  | "BUDGET_EXCEEDED"
  | "COOLDOWN_ACTIVE"
  | "PROVIDER_ERROR"
  | "PROVIDER_UNREACHABLE"
  | "VALIDATION_FAILED"
  | "CONTEXT_OVERFLOW"
  | "SCHEMA_MISMATCH"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "SANDBOX_ONLY";

const STATUS_MAP: Record<ErrorCode, number> = {
  BUDGET_EXCEEDED: 429,
  COOLDOWN_ACTIVE: 429,
  PROVIDER_ERROR: 502,
  PROVIDER_UNREACHABLE: 503,
  VALIDATION_FAILED: 400,
  CONTEXT_OVERFLOW: 413,
  SCHEMA_MISMATCH: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  SANDBOX_ONLY: 400,
};

export class DomainError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }

  /** The HTTP status code to use when serialising this error in a response. */
  get httpStatus(): number {
    return STATUS_MAP[this.code];
  }

  /** Plain JSON for API responses. */
  toJSON() {
    return { error: this.message, code: this.code };
  }
}

/**
 * Type guard: returns true if the value is a `DomainError` with a known code.
 * Handles both direct instances and serialised JSON round-trips.
 */
export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
