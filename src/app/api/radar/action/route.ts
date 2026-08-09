import { NextResponse } from "next/server";
import { z } from "zod";
import { readPersonaOrEmpty } from "@/domain/persona/store";
import { readSettings } from "@/domain/settings/store";
import { bankTopic } from "@/domain/radar/bank";
import { radarFeedbackStore } from "@/domain/radar/store";
import { runBoundaryCheck } from "@/domain/studio/boundary";
import { beginRun, createSession, saveSession, withRun } from "@/domain/studio/session";
import { newId, topicStore } from "@/domain/studio/store";

export const dynamic = "force-dynamic";
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss"), topicId: z.string().min(1) }),
  z.object({ action: z.literal("bank"), topicId: z.string().min(1) }),
  z.object({ action: z.literal("explore"), topicId: z.string().min(1) }),
  z.object({ action: z.literal("seed"), text: z.string().min(1).max(800) }),
]);

async function openInStudio(topicId: string) {
  const [topic, persona] = await Promise.all([topicStore.get(topicId), readPersonaOrEmpty()]);
  if (!topic) throw new Error("That Radar topic no longer exists.");
  const run = await beginRun(persona.activeVersion, `radar-explore-${topic.id}-${Date.now()}`);
  try {
    const boundary = await runBoundaryCheck({ title: topic.title, summary: topic.summary, boundaries: persona.boundaries, recorder: run.recorder });
    let session = await createSession(topic);
    session = withRun({ ...session, boundary }, run.recorder.id);
    session = await saveSession(session);
    if (boundary.blocked) await topicStore.put({ ...topic, status: "rejected", updatedAt: new Date().toISOString() });
    await run.recorder.finish("done");
    return { sessionId: session.id, blocked: boundary.blocked };
  } catch (error) {
    await run.recorder.finish("failed");
    throw error;
  }
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "That Radar action is not valid." }, { status: 400 });
  try {
    if (parsed.data.action === "dismiss") {
      const topic = await topicStore.get(parsed.data.topicId);
      if (!topic) return NextResponse.json({ error: "That topic no longer exists." }, { status: 404 });
      const now = new Date().toISOString();
      const saved = await topicStore.put({ ...topic, status: "dismissed", dismissedAt: now, updatedAt: now });
      await radarFeedbackStore.put({ id: topic.id, kind: "radar-dismissal", topicId: topic.id, title: topic.title, scoreComponents: topic.scoreComponents, createdAt: now });
      return NextResponse.json({ topic: saved });
    }
    if (parsed.data.action === "bank") {
      const [topic, settings] = await Promise.all([topicStore.get(parsed.data.topicId), readSettings()]);
      if (!topic) return NextResponse.json({ error: "That topic no longer exists." }, { status: 404 });
      return NextResponse.json({ topic: await topicStore.put(bankTopic(topic, settings.radar.bankDecayHours)) });
    }
    if (parsed.data.action === "seed") {
      const now = new Date().toISOString();
      const topic = await topicStore.put({
        id: newId(), title: parsed.data.text.trim(), summary: "A user seed to research and expand into angles.",
        sourceType: "seed", pillarId: null, freshness: "evergreen", status: "ready", context: parsed.data.text.trim(),
        scoreComponents: null, scoreTotal: null, scoreLabel: null, radarKind: "seed", angle: "", fitReason: "User-provided seed.",
        bankedAt: null, bankedUntil: null, dismissedAt: null, createdAt: now, updatedAt: now,
      });
      return NextResponse.json({ topic, ...await openInStudio(topic.id) });
    }
    return NextResponse.json(await openInStudio(parsed.data.topicId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
