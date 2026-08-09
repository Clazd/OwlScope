import { PageBody } from "@/components/common/PageBody";
import { PageHeader } from "@/components/common/PageHeader";
import { BrainEditor, BrainEmptyState } from "@/components/persona/BrainEditor";
import { isPersonaStarted } from "@/domain/persona/defaults";
import { readSnapshot } from "@/domain/persona/store";
import { listVersions } from "@/domain/persona/versions";
import { EvolutionPanel } from "@/components/persona/EvolutionPanel";
import { suggestionStore } from "@/domain/evolution/store";
import { feedbackStore } from "@/domain/feedback/store";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  const [snapshot, versions, suggestions, feedback] = await Promise.all([readSnapshot(), listVersions(), suggestionStore.list(), feedbackStore.list()]);

  if (!isPersonaStarted(snapshot.persona)) {
    return (
      <>
        <PageHeader title="Brain" subtitle="Start with an interview, a pasted profile, or guided onboarding" />
        <BrainEditor initial={snapshot} versions={[]} />
        <PageBody>
          <BrainEmptyState />
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Brain"
        subtitle={`${snapshot.persona.name} · version ${snapshot.persona.activeVersion} · ${snapshot.samples.length} samples`}
      />
      <BrainEditor
        initial={snapshot}
        versions={versions.map((v) => ({
          version: v.version,
          changeReason: v.changeReason,
          changeCount: v.changeCount,
          createdAt: v.createdAt,
          personaName: v.snapshot.persona.name,
        }))}
      />
      <EvolutionPanel initial={suggestions} eventCount={feedback.length} />
    </>
  );
}
