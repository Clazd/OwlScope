import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, guardExpensiveAction, stageErrorResponse } from "@/domain/studio/api";
import { runCritique } from "@/domain/studio/critique";
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
import { checkSimilarity } from "@/domain/studio/similarity";
import { sourcesByIds } from "@/domain/studio/store";
import { runValidation } from "@/domain/studio/validate";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().min(1),
  idempotencyKey: z.string().nullable().optional(),
  override: z.boolean().optional(),
});

/**
 * Stage 5. Fact validation, then style critique - two calls, in that order.
 *
 * They are separate because they answer different questions and because
 * merging them is exactly the collapse the whole design exists to prevent. The
 * validator's verdicts are handed to the critic as settled, so the critic
 * spends its budget on voice rather than re-checking arithmetic.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Which session should be critiqued?");

  const session = await readSession(parsed.data.sessionId);
  if (!session) return badRequest("That studio session no longer exists.");
  if (!session.research) return badRequest("Research has not run yet.");

  const draft = session.drafts.find((entry) => entry.id === session.selectedDraftId);
  if (!draft) return badRequest("Select a draft before critiquing it.");

  const topic = await readTopic(session.topicId);
  if (!topic) return badRequest("The topic behind this session no longer exists.");
  const angle = session.angles.find((entry) => entry.id === session.selectedAngleId);

  const guard = await guardExpensiveAction(
    parsed.data.idempotencyKey ?? null,
    parsed.data.override ?? false,
  );
  if (guard.response) return guard.response;

  const context = await loadContext();
  const run = await beginRun(context.persona.activeVersion, parsed.data.idempotencyKey ?? null);

  try {
    const sources = await sourcesByIds(session.research.sourceIds);

    const validation = await runValidation({
      sentences: draft.sentences,
      sources,
      recorder: run.recorder,
    });

    const similarity = await checkSimilarity({
      candidate: {
        id: "",
        text: draft.text,
        topic: topic.title,
        thesis: angle?.thesis ?? topic.title,
      },
      history: context.history,
      recorder: run.recorder,
    });

    const critique = await runCritique({
      text: draft.text,
      sentences: draft.sentences,
      sources,
      validation,
      similarity: similarity.result,
      persona: context.persona,
      fingerprint: context.fingerprint,
      experience: context.experience,
      recentPosts: context.recentPosts,
      recorder: run.recorder,
    });

    // The validator's verdict overrides the writer's self-assessment on the
    // stored sentences: the writer had an interest in the answer.
    const verdicts = new Map(validation.sentences.map((verdict) => [verdict.id, verdict]));
    const sentences = draft.sentences.map((sentence) => {
      const verdict = verdicts.get(sentence.id);
      if (!verdict) return sentence;
      return {
        ...sentence,
        support: sentence.claimType === "opinion" || sentence.claimType === "rhetorical" ? "n/a" as const : verdict.support,
        sourceIds: verdict.sourceIds.length > 0 ? verdict.sourceIds : sentence.sourceIds,
      };
    });

    const updated = { ...draft, sentences, similarity: similarity.result };
    let next = withRun(
      {
        ...session,
        drafts: session.drafts.map((entry) => (entry.id === draft.id ? updated : entry)),
        validation,
        critique,
      },
      run.recorder.id,
    );
    next = markStage(enterStage(next, "critique"), "critique", "done");

    const saved = await saveSession(next);
    await run.recorder.finish("done");
    return NextResponse.json({ session: saved, similarity: similarity.result, runId: run.recorder.id });
  } catch (err) {
    await run.recorder.finish("failed");
    return stageErrorResponse(err);
  }
}
