import { PageBody } from "@/components/common/PageBody";
import { PageHeader } from "@/components/common/PageHeader";
import { BrainEditor, BrainEmptyState } from "@/components/persona/BrainEditor";
import { isPersonaStarted } from "@/domain/persona/defaults";
import { readSnapshot } from "@/domain/persona/store";
import { listVersions } from "@/domain/persona/versions";

export const dynamic = "force-dynamic";

export default async function BrainPage() {
  const [snapshot, versions] = await Promise.all([readSnapshot(), listVersions()]);

  if (!isPersonaStarted(snapshot.persona)) {
    return (
      <>
        <PageHeader title="Brain" subtitle="Identity, pillars, beliefs, boundaries, voice" />
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
    </>
  );
}
