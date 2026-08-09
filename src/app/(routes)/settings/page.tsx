import { PageBody } from "@/components/common/PageBody";
import { PageHeader } from "@/components/common/PageHeader";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { readSettings, sandboxFromEnv } from "@/domain/settings/store";
import { isPersonaStarted } from "@/domain/persona/defaults";
import { readPersona } from "@/domain/persona/store";
import { countFixtures } from "@/services/ai/sandbox";
import { summariseData } from "@/services/storage/data-admin";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, summary, fixtures, persona] = await Promise.all([
    readSettings(),
    summariseData(),
    countFixtures(),
    readPersona(),
  ]);

  return (
    <>
      <PageHeader title="Settings" subtitle="Local only. The API key lives in .env and is never shown here." />
      <PageBody>
        <SettingsForm
          initial={settings}
          data={{ ...summary, fixtures }}
          sandboxForcedByEnv={sandboxFromEnv()}
          modelOverrides={{
            strong: process.env.AI_MODEL_STRONG || null,
            fast: process.env.AI_MODEL_FAST || null,
            baseUrl: process.env.AI_BASE_URL || null,
          }}
          hasPersona={isPersonaStarted(persona)}
          pillars={persona?.pillars ?? []}
        />
      </PageBody>
    </>
  );
}
