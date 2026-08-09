import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, guardExpensiveAction, stageErrorResponse } from "@/domain/studio/api";
import { runAnglePick, runAngles } from "@/domain/studio/angles";
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
import { sourcesByIds } from "@/domain/studio/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().min(1),
  /** "pick" asks the AI to choose and show its reasoning; otherwise generate. */
  mode: z.enum(["generate", "pick"]).default("generate"),
  idempotencyKey: z.string().nullable().optional(),
  override: z.boolean().optional(),
});

/** Stage 3. Four to six angles that genuinely disagree, or an AI pick. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Which session should be angled?");

  const session = await readSession(parsed.data.sessionId);
  if (!session) return badRequest("That studio session no longer exists.");
  if (!session.research) return badRequest("Research has not run yet. There is nothing to take an angle on.");

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
    if (parsed.data.mode === "pick") {
      if (session.angles.length === 0) return badRequest("There are no angles to pick from yet.");
      const pick = await runAnglePick({
        angles: session.angles,
        persona: context.persona,
        recentPosts: context.recentPosts,
        recorder: run.recorder,
      });
      const saved = await saveSession(
        withRun({ ...session, anglePick: pick, selectedAngleId: pick.angleId }, run.recorder.id),
      );
      await run.recorder.finish("done");
      return NextResponse.json({ session: saved, runId: run.recorder.id });
    }

    const sources = await sourcesByIds(session.research.sourceIds);
    const angles = await runAngles({
      topic,
      research: session.research,
      sources,
      persona: context.persona,
      recentPosts: context.recentPosts,
      experience: context.experience,
      recorder: run.recorder,
    });

    // New angles mean the drafts below them are about a different argument.
    let next = invalidateFrom(session, "drafts");
    next = withRun({ ...next, angles, anglePick: null, selectedAngleId: null }, run.recorder.id);
    next = markStage(enterStage(next, "angles"), "angles", "done");

    const saved = await saveSession(next);
    await run.recorder.finish("done");
    return NextResponse.json({ session: saved, runId: run.recorder.id });
  } catch (err) {
    await run.recorder.finish("failed");
    return stageErrorResponse(err);
  }
}
