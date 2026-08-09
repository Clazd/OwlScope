import "server-only";
import { createLogger } from "@/lib/logging/log";
import { dateKey, newId } from "@/lib/ids";
import { estimateCost } from "@/services/ai/pricing";
import { createJsonStore } from "@/services/storage/json-store";
import { DIRS } from "@/services/storage/paths";
import { ProviderError, type ErrorCategory } from "@/services/ai/types";
import { RunSchema, type Run, type RunKind, type RunStage } from "./schema";

const log = createLogger("runs");

/** `/data/runs/2026-08-09/run-<id>.json` — one file per run, foldered by day. */
export const runStore = createJsonStore<Run>(DIRS.runs, RunSchema, {
  fileName: (run) => `run-${run.id}.json`,
  subdir: (run) => dateKey(new Date(run.startedAt)),
  recursive: true,
});

export interface StageInput {
  stage: string;
  model: string;
  prompt: string;
  rawResponse: string;
  parsed?: unknown;
  validationError?: string | null;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  status?: RunStage["status"];
  errorCategory?: ErrorCategory | null;
}

export interface Recorder {
  readonly id: string;
  /** Appends a stage and flushes the run to disk. */
  record(input: StageInput): Promise<Run>;
  /** Records a failed stage from a thrown error, then rethrows nothing. */
  recordFailure(stage: string, model: string, prompt: string, err: unknown): Promise<Run>;
  finish(status: "done" | "failed"): Promise<Run>;
  current(): Run;
}

export interface StartRunOptions {
  kind: RunKind;
  personaVersion?: number;
  sandbox: boolean;
  idempotencyKey?: string | null;
}

/** Errors are recorded with a category so the Inspector never says "unknown". */
export function categoriseError(err: unknown): { category: ErrorCategory; message: string; detail?: string } {
  if (err instanceof ProviderError) {
    return { category: err.category, message: err.message, detail: err.detail };
  }
  return { category: "unknown", message: err instanceof Error ? err.message : String(err) };
}

/**
 * Looks for a run already started under this idempotency key today. A double
 * click, or a refresh mid-run, must never produce two runs.
 */
export async function findRunByKey(key: string): Promise<Run | null> {
  const runs = await runStore.list();
  const match = runs.find((r) => r.idempotencyKey === key);
  return match ?? null;
}

/** Closes a run whose process disappeared before its in-memory recorder could. */
export async function finishInterruptedRun(id: string): Promise<void> {
  const run = (await runStore.list()).find((item) => item.id === id);
  if (!run || run.status !== "running") return;
  await runStore.put({ ...run, status: "failed", finishedAt: new Date().toISOString() });
}

export async function startRun(options: StartRunOptions): Promise<Recorder> {
  let run: Run = {
    id: newId(),
    kind: options.kind,
    personaVersion: options.personaVersion ?? 0,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalCost: 0,
    sandbox: options.sandbox,
    idempotencyKey: options.idempotencyKey ?? null,
    stages: [],
  };

  await runStore.put(run);
  log.info(`run ${run.id} (${run.kind}) started${run.sandbox ? " in sandbox" : ""}`);

  async function flush(): Promise<Run> {
    run = await runStore.put(run);
    return run;
  }

  async function record(input: StageInput): Promise<Run> {
    const stage: RunStage = {
      stage: input.stage,
      model: input.model,
      prompt: input.prompt,
      rawResponse: input.rawResponse,
      parsed: input.parsed ?? null,
      validationError: input.validationError ?? null,
      latencyMs: input.latencyMs,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      status: input.status ?? "done",
      errorCategory: input.errorCategory ?? null,
    };
    run = {
      ...run,
      stages: [...run.stages, stage],
      totalTokensIn: run.totalTokensIn + stage.tokensIn,
      totalTokensOut: run.totalTokensOut + stage.tokensOut,
      totalCost: run.totalCost + estimateCost(stage.model, stage.tokensIn, stage.tokensOut),
    };
    return flush();
  }

  async function recordFailure(stage: string, model: string, prompt: string, err: unknown): Promise<Run> {
    const { category, message, detail } = categoriseError(err);
    log.error(`run ${run.id} stage ${stage} failed (${category}): ${message}`);
    return record({
      stage,
      model,
      prompt,
      rawResponse: detail ?? "",
      validationError: message,
      latencyMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      status: "failed",
      errorCategory: category,
    });
  }

  return {
    id: run.id,
    record,
    recordFailure,

    async finish(status) {
      run = { ...run, status, finishedAt: new Date().toISOString() };
      return flush();
    },

    current() {
      return run;
    },
  };
}
