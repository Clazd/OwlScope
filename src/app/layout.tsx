import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/common/AppShell";
import { getBudgetStatus } from "@/domain/budget/budget";
import { readPersona } from "@/domain/persona/store";
import { readSettings, sandboxEnabled } from "@/domain/settings/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "Persona Studio",
  description: "The office of an AI writer. Local only, file backed, human approved.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Settings, budget and sandbox state are read per request. There is one user
// and one process, so there is nothing here worth caching.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [settings, budget, sandbox, persona] = await Promise.all([
    readSettings(),
    getBudgetStatus(),
    sandboxEnabled(),
    readPersona(),
  ]);

  return (
    // The theme is stamped server-side from settings, so there is no flash of
    // the wrong palette and no blocking inline script.
    <html lang="en" data-theme={settings.appearance.theme}>
      <body>
        <AppShell
          personaName={persona?.name?.trim() || "Persona Studio"}
          model={settings.model.strong}
          tokensUsed={budget.tokensUsed}
          tokensBudget={budget.tokensBudget}
          sandbox={sandbox}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
