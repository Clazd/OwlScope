import { PageBody } from "@/components/common/PageBody";
import { PageHeader } from "@/components/common/PageHeader";
import { Memory } from "@/components/memory/Memory";
import { feedbackStore } from "@/domain/feedback/store";
import { summariseFeedback } from "@/domain/memory/feedback";
import { getMemoryIndex } from "@/domain/memory/index";
import { metricStore } from "@/domain/metrics/store";
import { buildPatternReport } from "@/domain/metrics/patterns";
import { readSettings } from "@/domain/settings/store";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const [index, feedback, metrics, settings] = await Promise.all([getMemoryIndex(), feedbackStore.list(), metricStore.list(), readSettings()]);
  const patterns = buildPatternReport(index.entries.filter((entry) => entry.kind === "content"), metrics, settings.memory.patternConfidenceFloor);
  return (
    <>
      <PageHeader title="Memory" subtitle={`${index.entries.length} entries · indexed ${index.builtAt.slice(0, 16).replace("T", " ")}`} action={<div className="flex flex-wrap gap-2"><a className="type-small rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink" href="/api/memory/export?format=json">Export JSON</a><a className="type-small rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink" href="/api/memory/export?format=markdown">Export published markdown</a></div>} />
      <PageBody wide>
        <Memory entries={index.entries} feedback={summariseFeedback(feedback)} patterns={patterns} />
      </PageBody>
    </>
  );
}
