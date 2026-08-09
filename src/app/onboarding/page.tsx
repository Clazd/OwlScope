import { PageHeader } from "@/components/common/PageHeader";
import { Onboarding } from "@/components/persona/Onboarding";
import { isPersonaStarted } from "@/domain/persona/defaults";
import { readSnapshot } from "@/domain/persona/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Onboarding — Persona Studio" };

/**
 * Not in the nav. Reached from Brain's empty state, from Settings, or directly.
 * Re-running it edits the existing persona rather than wiping it.
 */
export default async function OnboardingPage() {
  const snapshot = await readSnapshot();
  const rerun = isPersonaStarted(snapshot.persona);

  return (
    <>
      <PageHeader
        title={rerun ? "Onboarding, again" : "Set up your writer"}
        subtitle={rerun ? "Editing the persona you already have. Nothing is wiped." : "About five minutes"}
      />
      <Onboarding initial={snapshot} rerun={rerun} />
    </>
  );
}
