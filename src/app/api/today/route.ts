import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getBudgetStatus, gate } from "@/domain/budget/budget";
import { isPersonaStarted } from "@/domain/persona/defaults";
import { readPersonaOrEmpty } from "@/domain/persona/store";
import { sourcesByIds, contentStore, topicStore } from "@/domain/studio/store";
import { readSession } from "@/domain/studio/session";
import { todayStore } from "@/domain/today/store";
import { dateKey } from "@/lib/ids";
import { readToday, recoverInterruptedToday, startToday, waitForToday } from "@/services/orchestration/today";
import { dueAutopsy } from "@/domain/metrics/autopsy";
import { metricStore } from "@/domain/metrics/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["generate", "alternative", "search", "evergreen", "retry"]).default("generate"),
  idempotencyKey: z.string().min(1),
  override: z.boolean().optional(),
});

async function hydrate() {
  const [record, budget, allContent, metrics] = await Promise.all([readToday(), getBudgetStatus(), contentStore.list(), metricStore.list()]);
  const content = record?.contentId ? await contentStore.get(record.contentId) : null;
  const [topic, sources, session] = await Promise.all([
    record?.topicId ? topicStore.get(record.topicId) : Promise.resolve(null),
    content ? sourcesByIds(content.sourceIds) : Promise.resolve([]),
    record?.sessionId ? readSession(record.sessionId) : Promise.resolve(null),
  ]);
  const previous = (await todayStore.list())
    .filter((item) => item.date < dateKey() && item.copiedAt && item.contentId)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const previousContent = previous?.contentId ? await contentStore.get(previous.contentId) : null;
  const resume = previous && previousContent?.status === "accepted"
    ? { date: previous.date, contentId: previousContent.id, sessionId: previous.sessionId }
    : null;
  const autopsyContent = dueAutopsy(allContent, metrics);
  const autopsy = autopsyContent ? { contentId: autopsyContent.id, text: autopsyContent.text, publishedAt: autopsyContent.publishedAt! } : null;
  return { record, budget, content, topic, sources, session, resume, autopsy };
}

export async function GET() {
  await recoverInterruptedToday();
  return NextResponse.json(await hydrate());
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid Today action." }, { status: 400 });
  const persona = await readPersonaOrEmpty();
  if (!isPersonaStarted(persona)) {
    return NextResponse.json({ error: "Finish the persona before generating a daily recommendation." }, { status: 409 });
  }

  const existing = await recoverInterruptedToday();
  const cached = parsed.data.action === "generate" && existing && existing.status !== "failed";
  if (cached) return NextResponse.json(await hydrate());
  if (existing?.status === "running") return NextResponse.json(await hydrate(), { status: 202 });

  const budget = await getBudgetStatus();
  const decision = gate(budget, parsed.data.override ?? false);
  if (!decision.allowed) {
    return NextResponse.json({ error: decision.reason, budget }, { status: 429 });
  }

  const mode = parsed.data.action === "evergreen" ? "evergreen"
    : parsed.data.action === "search" ? "fresh"
      : "balanced";
  await startToday({
    idempotencyKey: parsed.data.idempotencyKey,
    mode,
    replace: parsed.data.action !== "generate" && parsed.data.action !== "retry",
    retry: parsed.data.action === "retry" || (parsed.data.action === "generate" && existing?.status === "failed"),
  });
  const today = dateKey();
  after(() => waitForToday(today));
  return NextResponse.json(await hydrate(), { status: 202 });
}
