import { PageBody } from "@/components/common/PageBody";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Radar } from "@/components/radar/Radar";
import { isPersonaStarted } from "@/domain/persona/defaults";
import { readPersonaOrEmpty } from "@/domain/persona/store";
import { readSettings } from "@/domain/settings/store";
import { expireBankedTopic } from "@/domain/radar/bank";
import { sourceStore, topicStore } from "@/domain/studio/store";

export const dynamic = "force-dynamic";

export default async function RadarPage({ searchParams }: { searchParams: Promise<{ tab?: string; scan?: string; seed?: string }> }) {
  const params = await searchParams;
  const [persona, settings, topics, sources] = await Promise.all([
    readPersonaOrEmpty(), readSettings(), topicStore.list(), sourceStore.list(),
  ]);
  if (!isPersonaStarted(persona)) {
    return (
      <>
        <PageHeader title="Radar" subtitle="Topics worth a look" />
        <PageBody><EmptyState>Finish Brain onboarding first. Radar needs your identity, pillars, and beliefs before it can judge relevance.</EmptyState></PageBody>
      </>
    );
  }
  const now = new Date();
  const current = [];
  for (const topic of topics) {
    const next = expireBankedTopic(topic, now);
    if (next.status !== topic.status) await topicStore.put(next);
    if (["ready", "banked"].includes(next.status) && next.radarKind) current.push(next);
  }
  current.sort((a, b) => (b.scoreTotal ?? 0) - (a.scoreTotal ?? 0));
  return (
    <>
      <PageHeader title="Radar" subtitle="Discovery without writing" />
      <PageBody wide>
        <Radar
          initialTopics={current}
          initialSources={sources}
          pillars={persona.pillars}
          providerSettings={settings.radar.providers}
          initialTab={params.tab === "bank" || params.tab === "evergreen" ? params.tab : "fresh"}
          runOnMount={params.scan === "1"}
          focusSeed={params.seed === "1"}
        />
      </PageBody>
    </>
  );
}
