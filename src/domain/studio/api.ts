import "server-only";
import { NextResponse } from "next/server";
import { getBudgetStatus, gate } from "@/domain/budget/budget";
import { createLogger } from "@/lib/logging/log";
import { categoriseError, findRunByKey } from "@/services/runs/recorder";
import { StageError } from "./stage";

const log = createLogger("api/studio");

/**
 * The three checks every expensive Studio action shares, in one place so no
 * route can forget one: replay an idempotent run, refuse when the budget says
 * so, and turn a stage failure into an error the user can act on.
 */

export interface GuardResult {
  /** Set when the guard has already decided the response. */
  response?: NextResponse;
}

export async function guardExpensiveAction(
  idempotencyKey: string | null,
  override: boolean,
): Promise<GuardResult> {
  if (idempotencyKey) {
    const replayed = await findRunByKey(idempotencyKey);
    if (replayed) {
      // A double click or a refresh mid-run resolves to the run that already
      // exists rather than paying for a second one.
      return { response: NextResponse.json({ runId: replayed.id, replayed: true }) };
    }
  }

  const status = await getBudgetStatus();
  const decision = gate(status, override);
  if (!decision.allowed) {
    return { response: NextResponse.json({ error: decision.reason, budget: status }, { status: 429 }) };
  }
  return {};
}

/**
 * A stage that fails does so loudly, with the draft preserved. The client keeps
 * whatever the session already held; this is only about saying what broke.
 */
export function stageErrorResponse(err: unknown): NextResponse {
  if (err instanceof StageError) {
    log.error(`stage ${err.stage} failed (${err.category}): ${err.message}`);
    return NextResponse.json(
      {
        error: err.message,
        stage: err.stage,
        errorCategory: err.category,
        detail: err.detail ?? null,
      },
      { status: 502 },
    );
  }
  const { category, message } = categoriseError(err);
  log.error(`studio action failed (${category}): ${message}`);
  return NextResponse.json({ error: message, errorCategory: category }, { status: 502 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}
