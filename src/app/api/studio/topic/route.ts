import { NextResponse } from "next/server";
import { z } from "zod";
import { readPersonaOrEmpty } from "@/domain/persona/store";
import { badRequest, stageErrorResponse } from "@/domain/studio/api";
import { runBoundaryCheck } from "@/domain/studio/boundary";
import { TopicFreshnessSchema } from "@/domain/studio/schema";
import { beginRun, createSession, enterStage, markStage, saveSession, withRun } from "@/domain/studio/session";
import { newId, topicStore } from "@/domain/studio/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().min(1).max(400),
  summary: z.string().max(2000).optional(),
  context: z.string().max(2000).optional(),
  pillarId: z.string().nullable().optional(),
  freshness: TopicFreshnessSchema.optional(),
  idempotencyKey: z.string().nullable().optional(),
});

/**
 * Stage 1. Creates the topic and runs the boundary check before anything else.
 *
 * A blocked topic returns here, and the run ends. There is no code path from
 * this route to the writer, which is what makes "no writing call is made" a
 * property of the routing rather than a promise.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Type a topic to work on.");

  const persona = await readPersonaOrEmpty();
  if (!persona.name.trim()) {
    return badRequest(
      "There is no persona yet. Finish onboarding, or load the Nova demo persona, before writing anything.",
    );
  }

  const { title, summary = "", context = "", pillarId = null, freshness = "current" } = parsed.data;

  const topic = await topicStore.put({
    id: newId(),
    title: title.trim(),
    summary: summary.trim(),
    sourceType: "manual",
    pillarId,
    freshness,
    status: "discovered",
    context: context.trim(),
    // Radar fills this in later. A manual topic was not scored by anything.
    scoreComponents: null,
    createdAt: new Date().toISOString(),
  });

  const run = await beginRun(persona.activeVersion, parsed.data.idempotencyKey ?? null);

  try {
    const boundary = await runBoundaryCheck({
      title: topic.title,
      summary: topic.summary,
      boundaries: persona.boundaries,
      recorder: run.recorder,
    });

    let session = await createSession(topic);
    session = withRun(session, run.recorder.id);
    session = { ...session, boundary };

    if (boundary.blocked) {
      await topicStore.put({ ...topic, status: "rejected" });
      session = markStage(session, "topic", "failed");
      const saved = await saveSession(session);
      await run.recorder.finish("done");
      return NextResponse.json({ session: saved, topic, blocked: true, runId: run.recorder.id });
    }

    await topicStore.put({ ...topic, status: "researching" });
    session = markStage(enterStage(session, "research"), "topic", "done");
    const saved = await saveSession(session);
    await run.recorder.finish("done");

    return NextResponse.json({ session: saved, topic, blocked: false, runId: run.recorder.id });
  } catch (err) {
    await run.recorder.finish("failed");
    return stageErrorResponse(err);
  }
}
