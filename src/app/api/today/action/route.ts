import { NextResponse } from "next/server";
import { z } from "zod";
import { feedbackStore } from "@/domain/feedback/store";
import type { TodayRejectionFeedback } from "@/domain/feedback/schema";
import { transitionContent } from "@/domain/studio/finalise";
import { contentStore } from "@/domain/studio/store";
import { todayStore } from "@/domain/today/store";
import { dateKey } from "@/lib/ids";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("copy") }),
  z.object({ action: z.literal("publish"), publicUrl: z.string().max(1000).nullable().optional() }),
  z.object({ action: z.literal("reject"), reasons: z.array(z.string()).max(20).default([]), note: z.string().max(1000).default("") }),
  z.object({ action: z.literal("feedback"), reasons: z.array(z.string()).max(20).default([]), note: z.string().max(1000).default("") }),
  z.object({ action: z.literal("undo-reject") }),
]);

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "That Today action is not valid." }, { status: 400 });
  const record = await todayStore.get(dateKey());
  if (!record?.contentId) return NextResponse.json({ error: "There is no daily recommendation to update." }, { status: 404 });
  const content = await contentStore.get(record.contentId);
  if (!content) return NextResponse.json({ error: "The recommended post no longer exists." }, { status: 404 });
  const now = new Date().toISOString();

  if (parsed.data.action === "copy") {
    const saved = await todayStore.put({ ...record, copiedAt: now, updatedAt: now });
    return NextResponse.json({ record: saved, content });
  }
  if (parsed.data.action === "publish") {
    const saved = content.status === "published"
      ? content
      : await transitionContent({ contentId: content.id, to: "published", publicUrl: parsed.data.publicUrl ?? null });
    return NextResponse.json({ record, content: saved });
  }
  if (parsed.data.action === "reject") {
    const saved = content.status === "rejected"
      ? content
      : await transitionContent({ contentId: content.id, to: "rejected", rejectionReasons: parsed.data.reasons });
    await feedbackStore.put({
      id: content.id,
      kind: "today-rejection",
      contentId: content.id,
      topicId: content.topicId,
      reasons: parsed.data.reasons,
      note: parsed.data.note.trim(),
      createdAt: now,
      undoneAt: null,
    });
    const next = await todayStore.put({ ...record, status: "rejected", updatedAt: now });
    return NextResponse.json({ record: next, content: saved });
  }
  if (parsed.data.action === "feedback") {
    const latest = (await feedbackStore.list())
      .filter((item): item is TodayRejectionFeedback => item.kind === "today-rejection" && item.contentId === content.id && !item.undoneAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (latest) {
      await feedbackStore.put({ ...latest, reasons: parsed.data.reasons, note: parsed.data.note.trim() });
    } else {
      await feedbackStore.put({
        id: content.id, kind: "today-rejection", contentId: content.id, topicId: content.topicId,
        reasons: parsed.data.reasons, note: parsed.data.note.trim(), createdAt: now, undoneAt: null,
      });
    }
    return NextResponse.json({ record, content });
  }

  let restored = content;
  if (restored.status === "rejected") restored = await transitionContent({ contentId: restored.id, to: "draft" });
  if (restored.status === "draft") restored = await transitionContent({ contentId: restored.id, to: "reviewing" });
  if (restored.status === "reviewing") restored = await transitionContent({ contentId: restored.id, to: "accepted" });
  const feedback = (await feedbackStore.list()).filter(
    (item): item is TodayRejectionFeedback => item.kind === "today-rejection" && item.contentId === content.id && !item.undoneAt,
  );
  await Promise.all(feedback.map((item) => feedbackStore.put({ ...item, undoneAt: now })));
  const next = await todayStore.put({ ...record, status: "recommendation", updatedAt: now });
  return NextResponse.json({ record: next, content: restored });
}
