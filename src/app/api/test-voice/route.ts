import { NextResponse } from "next/server";
import { z } from "zod";
import { createLogger } from "@/lib/logging/log";
import { getBudgetStatus, gate } from "@/domain/budget/budget";
import { FingerprintSchema, PersonaSchema } from "@/domain/persona/schema";
import { readExperience, readFingerprint, readPersona } from "@/domain/persona/store";
import { runTestVoice } from "@/domain/persona/test-voice";
import { categoriseError, findRunByKey } from "@/services/runs/recorder";

const log = createLogger("api/test-voice");

export const dynamic = "force-dynamic";

const Body = z.object({
  topic: z.string().min(1),
  /**
   * The editor's unsaved state, so the user can tune and test without
   * committing a version first. Falls back to what is on disk.
   */
  persona: PersonaSchema.optional(),
  fingerprint: FingerprintSchema.nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  override: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a topic to test against." }, { status: 400 });
  }
  const { topic, idempotencyKey = null, override = false } = parsed.data;

  if (idempotencyKey) {
    const replayed = await findRunByKey(idempotencyKey);
    if (replayed) return NextResponse.json({ runId: replayed.id, replayed: true });
  }

  const persona = parsed.data.persona ?? (await readPersona());
  if (!persona || !persona.name.trim()) {
    return NextResponse.json(
      { error: "There is no persona to test yet. Finish onboarding, or load the Nova demo persona." },
      { status: 400 },
    );
  }

  const status = await getBudgetStatus();
  const decision = gate(status, override);
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.reason, budget: status }, { status: 429 });
  }

  const fingerprint = parsed.data.fingerprint !== undefined ? parsed.data.fingerprint : await readFingerprint();
  const experience = await readExperience();

  try {
    // Nothing here is saved to content history: this is a tuning surface.
    const result = await runTestVoice({ topic, persona, fingerprint, experience, idempotencyKey });
    return NextResponse.json(result);
  } catch (err) {
    const { category, message } = categoriseError(err);
    log.error(`test voice failed (${category}): ${message}`);
    return NextResponse.json({ error: message, errorCategory: category }, { status: 502 });
  }
}
