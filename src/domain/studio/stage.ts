import "server-only";
import type { ZodType } from "zod";
import { createLogger } from "@/lib/logging/log";
import { getProvider } from "@/services/ai/provider";
import type { ModelTier } from "@/services/ai/types";
import type { Recorder } from "@/services/runs/recorder";
import type { SectionUsage } from "./context";

const log = createLogger("studio/stage");

/**
 * One pipeline stage: assemble, call, validate, record.
 *
 * Every stage goes through here, which is what makes the Inspector complete
 * rather than nearly complete - there is no path to the provider that forgets
 * to write down what it sent.
 *
 * The repair policy lives in the provider adapter: exactly one repair attempt
 * with the schema error fed back, then a loud failure. This wrapper adds the
 * other half of the brief's rule - a stage that fails does so with a usable
 * error and without destroying the work that came before it.
 */

export class StageError extends Error {
  readonly stage: string;
  readonly category: string;
  readonly detail?: string;

  constructor(stage: string, message: string, category: string, detail?: string) {
    super(message);
    this.name = "StageError";
    this.stage = stage;
    this.category = category;
    this.detail = detail;
  }
}

export interface StageRequest<T> {
  stage: string;
  tier: ModelTier;
  prompt: string;
  schema: ZodType<T>;
  schemaName: string;
  maxTokens?: number;
  temperature?: number;
  recorder: Recorder;
  /** Context budget accounting, logged next to the stage in the Inspector. */
  usage?: SectionUsage[];
  fixtureCase?: string;
}

export interface StageResult<T> {
  data: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  costEstimate: number;
  repaired: boolean;
  sandbox: boolean;
}

export async function runStage<T>(req: StageRequest<T>): Promise<StageResult<T>> {
  const resolved = await getProvider();

  try {
    const result = await resolved.provider.completeStructured({
      stage: req.stage,
      tier: req.tier,
      prompt: req.prompt,
      schema: req.schema,
      schemaName: req.schemaName,
      maxTokens: req.maxTokens,
      temperature: req.temperature,
      fixtureCase: req.fixtureCase,
    });

    await req.recorder.record({
      stage: req.stage,
      model: result.model,
      prompt: result.prompt,
      rawResponse: result.text,
      parsed: budgetAnnotated(result.data, req.usage, result.repaired),
      latencyMs: result.latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });

    if (result.repaired) log.warn(`${req.stage} needed one repair pass`);

    return {
      data: result.data,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      latencyMs: result.latencyMs,
      costEstimate: result.costEstimate,
      repaired: result.repaired,
      sandbox: result.sandbox,
    };
  } catch (err) {
    await req.recorder.recordFailure(req.stage, resolved.models[req.tier], req.prompt, err);
    const message = err instanceof Error ? err.message : String(err);
    const category = (err as { category?: string }).category ?? "unknown";
    const detail = (err as { detail?: string }).detail;
    log.error(
      `${req.stage} failed (${category}) on ${resolved.models[req.tier]}` +
      ` with a ${req.prompt.length}-char prompt and a ${req.maxTokens ?? "default"}-token cap: ${message}`,
    );
    throw new StageError(req.stage, message, category, detail);
  }
}

/**
 * The parsed output as the Inspector shows it, with the context accounting
 * beside it. Chain of thought is still never stored - this is measurement.
 */
function budgetAnnotated(data: unknown, usage: SectionUsage[] | undefined, repaired: boolean): unknown {
  if (!usage && !repaired) return data;
  return { output: data, contextBudget: usage ?? [], repaired };
}
