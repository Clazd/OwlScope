import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, guardExpensiveAction, stageErrorResponse } from "@/domain/studio/api";
import { runResearch } from "@/domain/studio/research";
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
import { sourcesForTopic } from "@/domain/studio/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().min(1),
  /** Links the user pasted. Fetched through the SSRF guard, never guessed at. */
  manualUrls: z.array(z.string()).max(5).optional(),
  idempotencyKey: z.string().nullable().optional(),
  override: z.boolean().optional(),
});

/** Stage 2. Search, store sources, then reason about them. Never write. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Which session should be researched?");

  const session = await readSession(parsed.data.sessionId);
  if (!session) return badRequest("That studio session no longer exists.");
  if (session.boundary?.blocked) {
    return badRequest("This topic is blocked by a persona boundary. Nothing will be researched or written.");
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
    const { record } = await runResearch({
      topic,
      manualUrls: parsed.data.manualUrls,
      recorder: run.recorder,
    });

    // Re-running research invalidates everything downstream: angles chosen
    // against different evidence are angles about a different post.
    let next = invalidateFrom(session, "angles");
    next = withRun({ ...next, research: record }, run.recorder.id);
    next = markStage(enterStage(next, record.insufficient ? "research" : "angles"), "research", "done");
    if (record.insufficient) next = markStage(next, "research", "failed");

    const saved = await saveSession(next);
    await run.recorder.finish("done");

    return NextResponse.json({
      session: saved,
      sources: await sourcesForTopic(topic.id),
      topic,
      runId: run.recorder.id,
    });
  } catch (err) {
    await run.recorder.finish("failed");
    return stageErrorResponse(err);
  }
}
