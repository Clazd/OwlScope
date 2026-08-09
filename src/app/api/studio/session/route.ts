import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest } from "@/domain/studio/api";
import { STUDIO_STAGES } from "@/domain/studio/schema";
import { enterStage, readSession, readTopic, saveSession } from "@/domain/studio/session";
import { contentStore, sourcesForTopic } from "@/domain/studio/store";

export const dynamic = "force-dynamic";

/** Reads a session back, so a refresh mid-run resumes rather than restarts. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return badRequest("Which session?");

  const session = await readSession(id);
  if (!session) return badRequest("That studio session no longer exists.");

  const [sources, topic, content] = await Promise.all([
    sourcesForTopic(session.topicId),
    readTopic(session.topicId),
    session.contentId ? contentStore.get(session.contentId) : Promise.resolve(null),
  ]);

  return NextResponse.json({ session, sources, topic, content });
}

const Body = z.object({
  sessionId: z.string().min(1),
  stage: z.enum(STUDIO_STAGES),
});

/**
 * Stage navigation. Clicking a completed stage returns to it without destroying
 * later work - this only moves the cursor. The stages that invalidate downstream
 * output do so when they re-run, not when they are looked at.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Which session, and which stage?");

  const session = await readSession(parsed.data.sessionId);
  if (!session) return badRequest("That studio session no longer exists.");

  const state = session.stageStates[parsed.data.stage];
  if (state === "pending") {
    return badRequest("That stage has not run yet. Work forward to it.");
  }

  const saved = await saveSession(enterStage(session, parsed.data.stage));
  return NextResponse.json({ session: saved });
}
