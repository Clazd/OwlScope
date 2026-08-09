import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, guardExpensiveAction, stageErrorResponse } from "@/domain/studio/api";
import {
  beginRun,
  enterStage,
  invalidateFrom,
  loadContext,
  markStage,
  readSession,
  readTopic,
  saveSession,
  withRun,
} from "@/domain/studio/session";
import { checkSimilarity } from "@/domain/studio/similarity";
import { sourcesByIds } from "@/domain/studio/store";
import { REVISION_ACTIONS, invitesFirstHandClaim, runDrafts, runRevision } from "@/domain/studio/write";
import type { StudioDraft } from "@/domain/studio/schema";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().min(1),
  action: z.enum(["generate", "select", ...(Object.keys(REVISION_ACTIONS) as [string, ...string[]])]),
  draftId: z.string().optional(),
  idempotencyKey: z.string().nullable().optional(),
  override: z.boolean().optional(),
});

/**
 * Stage 4. Generate drafts, revise one, or select one.
 *
 * Selecting is free - it is a click, not a call - so it short-circuits before
 * the budget gate. Everything else costs money and goes through it.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Which session, and what should happen to it?");

  const session = await readSession(parsed.data.sessionId);
  if (!session) return badRequest("That studio session no longer exists.");
  if (!session.research) return badRequest("Research has not run yet.");

  const angle = session.angles.find((entry) => entry.id === session.selectedAngleId);
  if (!angle) return badRequest("Pick an angle before writing anything.");

  if (parsed.data.action === "select") {
    const draft = session.drafts.find((entry) => entry.id === parsed.data.draftId);
    if (!draft) return badRequest("That draft is not in this session.");
    const saved = await saveSession(
      markStage(enterStage({ ...session, selectedDraftId: draft.id }, "critique"), "drafts", "done"),
    );
    return NextResponse.json({ session: saved });
  }

  const topic = await readTopic(session.topicId);
  if (!topic) return badRequest("The topic behind this session no longer exists.");

  const guard = await guardExpensiveAction(
    parsed.data.idempotencyKey ?? null,
    parsed.data.override ?? false,
  );
  if (guard.response) return guard.response;

  const context = await loadContext();
  const run = await beginRun(context.persona.activeVersion, parsed.data.idempotencyKey ?? null);

  try {
    const sources = await sourcesByIds(session.research.sourceIds);
    const shared = {
      topic,
      angle,
      research: session.research,
      sources,
      persona: context.persona,
      fingerprint: context.fingerprint,
      // Only when the topic could invite a first-hand claim. Sending the log to
      // a stage that cannot make one is an invitation to work one in.
      experience: invitesFirstHandClaim(topic, angle) ? context.experience : null,
      recentPosts: context.recentPosts,
      recorder: run.recorder,
    };

    let drafts: StudioDraft[];
    let next = session;

    if (parsed.data.action === "generate") {
      drafts = await runDrafts({ ...shared, count: 3 });
      next = invalidateFrom(session, "critique");
      next = { ...next, drafts, selectedDraftId: null };
    } else {
      const current = session.drafts.find((entry) => entry.id === parsed.data.draftId);
      if (!current) return badRequest("That draft is not in this session.");
      const revised = await runRevision({
        ...shared,
        draft: current,
        action: parsed.data.action as keyof typeof REVISION_ACTIONS,
      });
      // Replace in place so the card the user was looking at stays where it is.
      drafts = session.drafts.map((entry) => (entry.id === current.id ? revised : entry));
      next = invalidateFrom({ ...session, drafts }, "critique");
      next = { ...next, drafts, selectedDraftId: session.selectedDraftId === current.id ? revised.id : session.selectedDraftId };
    }

    // Similarity runs on every draft. L1 and L2 are free; L3 only fires when
    // they found something worth a second opinion.
    const scored = await Promise.all(
      drafts.map(async (draft) => {
        const record = await checkSimilarity({
          candidate: { id: "", text: draft.text, topic: topic.title, thesis: angle.thesis },
          history: context.history,
          recorder: run.recorder,
        });
        return { ...draft, similarity: record.result };
      }),
    );

    next = withRun({ ...next, drafts: scored }, run.recorder.id);
    next = markStage(enterStage(next, "drafts"), "angles", "done");

    const saved = await saveSession(next);
    await run.recorder.finish("done");
    return NextResponse.json({ session: saved, runId: run.recorder.id });
  } catch (err) {
    await run.recorder.finish("failed");
    // The session is untouched, so the drafts the user already had survive.
    return stageErrorResponse(err);
  }
}
