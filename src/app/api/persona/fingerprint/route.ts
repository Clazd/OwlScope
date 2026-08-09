import { NextResponse } from "next/server";
import { z } from "zod";
import { createLogger } from "@/lib/logging/log";
import { getBudgetStatus, gate } from "@/domain/budget/budget";
import { analyseFingerprint } from "@/domain/persona/analyse";
import { FingerprintSchema, SampleSchema } from "@/domain/persona/schema";
import { readFingerprint, readPersonaOrEmpty, readSamples, writeFingerprint } from "@/domain/persona/store";
import { categoriseError, findRunByKey } from "@/services/runs/recorder";

const log = createLogger("api/persona/fingerprint");

export const dynamic = "force-dynamic";

const AnalyseBody = z.object({
  /** Unsaved samples from the editor, so analysis works before a save. */
  samples: z.array(SampleSchema).optional(),
  idempotencyKey: z.string().nullable().optional(),
  override: z.boolean().optional(),
  /**
   * Set once the user has been asked about overwriting their manual edits.
   * Without it, a hand-edited fingerprint is never silently replaced.
   */
  overwriteUserEdits: z.boolean().optional(),
});

export async function POST(request: Request) {
  const body = AnalyseBody.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "That request is not valid." }, { status: 400 });
  }
  const { samples: bodySamples, idempotencyKey = null, override = false, overwriteUserEdits = false } = body.data;

  const existing = await readFingerprint();
  if (existing?.editedByUser && !overwriteUserEdits) {
    return NextResponse.json(
      {
        needsConfirmation: true,
        error:
          "You have hand-edited this fingerprint. Re-analysing replaces those edits with a fresh read of your samples.",
      },
      { status: 409 },
    );
  }

  if (idempotencyKey) {
    const replayed = await findRunByKey(idempotencyKey);
    if (replayed) return NextResponse.json({ runId: replayed.id, replayed: true });
  }

  const status = await getBudgetStatus();
  const decision = gate(status, override);
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.reason, budget: status }, { status: 429 });
  }

  const samples = bodySamples ?? (await readSamples());
  const persona = await readPersonaOrEmpty();

  try {
    const result = await analyseFingerprint({
      samples,
      personaVersion: persona.activeVersion,
      idempotencyKey,
    });
    // Written straight away so a refresh does not lose an analysis that was
    // already paid for.
    const saved = await writeFingerprint(FingerprintSchema.parse(result.fingerprint));
    return NextResponse.json({
      fingerprint: saved,
      runId: result.runId,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costEstimate: result.costEstimate,
      sandbox: result.sandbox,
    });
  } catch (err) {
    const { category, message } = categoriseError(err);
    log.error(`fingerprint analysis failed (${category}): ${message}`);
    return NextResponse.json({ error: message, errorCategory: category }, { status: 502 });
  }
}

/** Manual edits. Sets editedByUser so re-analysis has to ask first. */
export async function PUT(request: Request) {
  const parsed = FingerprintSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return NextResponse.json({ error: `That fingerprint is not valid. ${detail}` }, { status: 400 });
  }
  const saved = await writeFingerprint({ ...parsed.data, editedByUser: true });
  return NextResponse.json({ fingerprint: saved });
}
