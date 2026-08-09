import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logging/log";
import { getBudgetStatus, gate } from "@/domain/budget/budget";
import { getProvider } from "@/services/ai/provider";
import { categoriseError, findRunByKey, startRun } from "@/services/runs/recorder";

const log = createLogger("api/test-connection");

export const dynamic = "force-dynamic";

/** The smallest useful call: one token in, one token out. */
const STAGE = "connection";
const PROMPT = 'Reply with the single word "ready" and nothing else.';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : null;
  const override = body.override === true;

  // A double click, or a refresh mid-run, resolves to the run that already
  // exists instead of paying for a second one.
  if (idempotencyKey) {
    const existing = await findRunByKey(idempotencyKey);
    if (existing) {
      return NextResponse.json({ runId: existing.id, replayed: true, run: existing });
    }
  }

  const status = await getBudgetStatus();
  const decision = gate(status, override);
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.reason, budget: status }, { status: 429 });
  }

  let resolved;
  try {
    resolved = await getProvider();
  } catch (err) {
    const { message } = categoriseError(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const recorder = await startRun({
    kind: "connection",
    sandbox: resolved.sandbox,
    idempotencyKey,
  });

  try {
    const result = await resolved.provider.complete({
      stage: STAGE,
      tier: "fast",
      prompt: PROMPT,
      maxTokens: 8,
      temperature: 0,
      timeoutMs: 30_000,
    });

    await recorder.record({
      stage: STAGE,
      model: result.model,
      prompt: result.prompt,
      rawResponse: result.text,
      parsed: { reply: result.text.trim() },
      latencyMs: result.latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });
    const run = await recorder.finish("done");

    return NextResponse.json({
      ok: true,
      runId: run.id,
      sandbox: result.sandbox,
      model: result.model,
      latencyMs: result.latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costEstimate: result.costEstimate,
      reply: result.text.trim(),
    });
  } catch (err) {
    const { category, message } = categoriseError(err);
    await recorder.recordFailure(STAGE, resolved.models.fast, PROMPT, err);
    const run = await recorder.finish("failed");
    log.error(`test connection failed (${category}): ${message}`);
    return NextResponse.json({ ok: false, error: message, errorCategory: category, runId: run.id }, { status: 502 });
  }
}
