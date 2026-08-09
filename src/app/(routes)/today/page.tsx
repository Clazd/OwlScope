import { Today } from "@/components/today/Today";
import { getBudgetStatus } from "@/domain/budget/budget";
import { readPersonaOrEmpty } from "@/domain/persona/store";
import { readSettings } from "@/domain/settings/store";
import { readSession } from "@/domain/studio/session";
import { contentStore, sourcesByIds, topicStore } from "@/domain/studio/store";
import { todayStore } from "@/domain/today/store";
import { dateKey } from "@/lib/ids";
import { formatLongDate } from "@/lib/format/display";
import { dueAutopsy } from "@/domain/metrics/autopsy";
import { metricStore } from "@/domain/metrics/store";
import { resolveConfiguredModels } from "@/services/ai/provider";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const [persona, settings, budget, record, allContent, metrics] = await Promise.all([
    readPersonaOrEmpty(), readSettings(), getBudgetStatus(), todayStore.get(dateKey()), contentStore.list(), metricStore.list(),
  ]);
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
  const models = resolveConfiguredModels(settings.model);

  return (
    <Today
      persona={persona}
      model={models.strong}
      dateLabel={formatLongDate(new Date())}
      initial={{ record, budget, content, topic, sources, session, resume, autopsy }}
    />
  );
}
