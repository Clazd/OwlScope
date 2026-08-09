import { PageBody } from "@/components/common/PageBody";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Studio } from "@/components/studio/Studio";
import { isPersonaStarted } from "@/domain/persona/defaults";
import { readPersonaOrEmpty } from "@/domain/persona/store";

export const dynamic = "force-dynamic";

/**
 * The Studio route. Identity before generation, rule one: with no persona
 * there is nothing to write in the voice of, so the screen says so rather than
 * offering a text box that would produce beige output.
 */
export default async function StudioPage() {
  const persona = await readPersonaOrEmpty();

  if (!isPersonaStarted(persona)) {
    return (
      <>
        <PageHeader title="Studio" subtitle="Draft, evidence, critique" />
        <PageBody>
          <EmptyState>
            There is no persona yet, and identity comes before generation. Finish onboarding, or load
            the Nova demo persona from Brain, and the Studio will have a voice to write in.
          </EmptyState>
        </PageBody>
      </>
    );
  }

  const handle = persona.name.trim().toLowerCase().replace(/[^a-z0-9]/g, "") || "you";

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader
        title="Studio"
        subtitle={`${persona.name} · version ${persona.activeVersion} · manual topics only until Radar ships`}
      />
      <Studio
        pillars={persona.pillars}
        personaName={persona.name}
        handle={handle}
      />
    </div>
  );
}
