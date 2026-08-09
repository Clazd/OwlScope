import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, guardExpensiveAction, stageErrorResponse } from "@/domain/studio/api";
import { createContentItem, runReasoning } from "@/domain/studio/finalise";
import { evaluateGates } from "@/domain/studio/gates";
import {
  beginRun,
  enterStage,
  loadContext,
  markStage,
  readSession,
  readTopic,
  saveSession,
  withRun,
} from "@/domain/studio/session";
import { checkSimilarity, mergeSimilarity } from "@/domain/studio/similarity";
import { sourcesByIds, topicStore } from "@/domain/studio/store";
import { scoreAgainstFingerprint } from "@/domain/persona/fingerprint";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().min(1),
  /**
   * An explicit, recorded confirmation for the unsupported-claim gate. It names
   * the sentences it covers, so confirming one does not silently clear the next.
   */
  override: z
    .object({ reason: z.string().min(1), sentenceIds: z.array(z.string()).min(1) })
    .nullable()
    .optional(),
  idempotencyKey: z.string().nullable().optional(),
  budgetOverride: z.boolean().optional(),
});

/**
 * Stage 6. Runs the gates, writes the reasoning, stores the content item.
 *
 * The item is created as a draft. Nothing here publishes anything — that needs
 * the explicit "Mark published" action, which lives in the content route.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Which session should be finalised?");

  const session = await readSession(parsed.data.sessionId);
  if (!session) return badRequest("That studio session no longer exists.");
  if (!session.research) return badRequest("Research has not run yet.");

  const draft = session.drafts.find((entry) => entry.id === session.selectedDraftId);
  if (!draft) return badRequest("Select a draft before finalising.");
  const angle = session.angles.find((entry) => entry.id === session.selectedAngleId);
  if (!angle) return badRequest("No angle is selected for this session.");

  const topic = await readTopic(session.topicId);
  if (!topic) return badRequest("The topic behind this session no longer exists.");

  const context = await loadContext();
  const override = parsed.data.override ?? null;
  const scored = scoreAgainstFingerprint(draft.text, context.fingerprint);

  /**
   * Similarity is recomputed here rather than reused from the draft.
   *
   * The stored result was measured when the draft was written, and the history
   * moves: a post published in between would make a passing verdict wrong in
   * the direction that matters. The free layers cost nothing, so there is no
   * argument for judging against a stale answer. L3 stays off — it already ran
   * at draft time and this pass exists to refresh the cheap layers, not to buy
   * a second opinion.
   */
  const rechecked = await checkSimilarity({
    candidate: { id: "", text: draft.text, topic: topic.title, thesis: angle.thesis },
    history: context.history,
    allowModel: false,
  });
  // The draft's result carries L3's opinion, which this pass did not buy again.
  const similarityResult = mergeSimilarity(rechecked.result, draft.similarity);

  // The gates run before any spend. A blocked candidate never reaches the
  // reasoning call, so a post that cannot ship also cannot cost anything extra.
  const report = evaluateGates({
    sentences: draft.sentences,
    characterCount: draft.characterCount,
    validation: session.validation,
    critique: session.critique,
    similarity: similarityResult,
    fingerprintScore: draft.fingerprintScore,
    fingerprintScored: draft.fingerprintScored,
    fingerprintDeviations: scored.deviations,
    boundaryBlocked: session.boundary?.blocked ?? false,
    boundaryExplanation: session.boundary?.explanation ?? "",
    staleAsCurrent: topic.freshness === "current" && session.research.insufficient,
    overriddenSentenceIds: override?.sentenceIds ?? [],
  });

  if (!report.canFinalise) {
    return NextResponse.json({ gates: report, finalised: false }, { status: 409 });
  }

  const guard = await guardExpensiveAction(
    parsed.data.idempotencyKey ?? null,
    parsed.data.budgetOverride ?? false,
  );
  if (guard.response) return guard.response;

  const run = await beginRun(context.persona.activeVersion, parsed.data.idempotencyKey ?? null);

  try {
    const sources = await sourcesByIds(session.research.sourceIds);
    // The vectors describe the text being saved; the result is what the gates judged.
    const similarity = { ...rechecked, result: similarityResult };

    const reasoning = await runReasoning({
      topic,
      angle,
      draft,
      research: session.research,
      sources,
      similarity,
      recentPosts: context.recentPosts,
      recorder: run.recorder,
    });

    const item = await createContentItem({
      topic,
      angle,
      draft,
      persona: context.persona,
      validation: session.validation,
      critique: session.critique,
      similarity,
      reasoning,
      override,
      provider: run.provider,
      model: run.models.strong,
      runId: run.recorder.id,
    });

    await topicStore.put({ ...topic, status: "used" });

    let next = withRun({ ...session, reasoning, contentId: item.id }, run.recorder.id);
    next = markStage(enterStage(next, "final"), "final", "done");
    const saved = await saveSession(next);
    await run.recorder.finish("done");

    return NextResponse.json({ session: saved, content: item, gates: report, finalised: true });
  } catch (err) {
    await run.recorder.finish("failed");
    return stageErrorResponse(err);
  }
}
