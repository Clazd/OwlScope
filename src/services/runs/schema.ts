import { z } from "zod";

export const RunKindSchema = z.enum([
  "today",
  "studio",
  "radar",
  "test-voice",
  "fingerprint",
  "persona-import",
  "connection",
]);
export type RunKind = z.infer<typeof RunKindSchema>;

export const RunStatusSchema = z.enum(["running", "done", "failed"]);
export const StageStatusSchema = z.enum(["done", "failed", "skipped", "running"]);

export const ErrorCategorySchema = z.enum([
  "config",
  "auth",
  "timeout",
  "network",
  "rate-limit",
  "context-overflow",
  "http",
  "parse",
  "schema",
  "fixture-missing",
  "unknown",
]);

/**
 * A stage records what was sent, what came back, and what it cost.
 *
 * It never records chain of thought. Structured decisions, scores, critiques
 * and operational metadata only - that rule is enforced here by there being
 * nowhere to put reasoning text.
 */
export const RunStageSchema = z.object({
  stage: z.string().min(1),
  model: z.string(),
  prompt: z.string(),
  rawResponse: z.string(),
  parsed: z.unknown().nullable(),
  validationError: z.string().nullable(),
  latencyMs: z.number().min(0),
  tokensIn: z.number().min(0),
  tokensOut: z.number().min(0),
  status: StageStatusSchema,
  errorCategory: ErrorCategorySchema.nullable(),
});
export type RunStage = z.infer<typeof RunStageSchema>;

export const RunSchema = z.object({
  id: z.string().min(1),
  kind: RunKindSchema,
  personaVersion: z.number().int().min(0),
  status: RunStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  totalTokensIn: z.number().min(0),
  totalTokensOut: z.number().min(0),
  totalCost: z.number().min(0),
  /** True when every stage was served from `/fixtures`. */
  sandbox: z.boolean(),
  /**
   * Set by the caller of an expensive action. A double click or a refresh
   * mid-run resolves to the existing run instead of starting a second one.
   */
  idempotencyKey: z.string().nullable(),
  stages: z.array(RunStageSchema),
});
export type Run = z.infer<typeof RunSchema>;
