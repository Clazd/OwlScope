import { PageBody } from "@/components/common/PageBody";
import { PageHeader } from "@/components/common/PageHeader";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { readSettings, sandboxFromEnv } from "@/domain/settings/store";
import { countFixtures } from "@/services/ai/sandbox";
import { summariseData } from "@/services/storage/data-admin";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, summary, fixtures] = await Promise.all([readSettings(), summariseData(), countFixtures()]);

  return (
    <>
      <PageHeader title="Settings" subtitle="Local only. The API key lives in .env and is never shown here." />
      <PageBody>
        <SettingsForm
          initial={settings}
          data={{ ...summary, fixtures }}
          sandboxForcedByEnv={sandboxFromEnv()}
        />
      </PageBody>
    </>
  );
}
