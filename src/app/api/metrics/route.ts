import { NextResponse } from "next/server";
import { z } from "zod";
import { MetricInputSchema } from "@/domain/metrics/schema";
import { metricStore } from "@/domain/metrics/store";
import { contentStore } from "@/domain/studio/store";

const Body = z.object({
  action: z.enum(["prompt", "save", "skip"]),
  contentId: z.string().min(1),
  metrics: MetricInputSchema.optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Choose a published post and valid non-negative counts." }, { status: 400 });
  const content = await contentStore.get(parsed.data.contentId);
  if (!content || content.status !== "published") return NextResponse.json({ error: "Metrics can only be attached to a published post." }, { status: 409 });
  const now = new Date().toISOString();
  const empty = { impressions: null, likes: null, replies: null, reposts: null, bookmarks: null, profileVisits: null, followersGained: null };
  const metric = await metricStore.put({
    id: content.id,
    contentId: content.id,
    ...(parsed.data.action === "save" ? (parsed.data.metrics ?? empty) : empty),
    promptedAt: now,
    recordedAt: parsed.data.action === "save" ? now : null,
    skippedAt: parsed.data.action === "skip" ? now : null,
  });
  return NextResponse.json(metric);
}
