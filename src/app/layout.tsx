import type { Metadata, Viewport } from "next";
import { AppShell } from "@/components/common/AppShell";
import { getBudgetStatus } from "@/domain/budget/budget";
import { readSettings, sandboxEnabled } from "@/domain/settings/store";
import { resolveConfiguredModels } from "@/services/ai/provider";
import "./globals.css";

const APP_NAME = "OwlScope";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "A local-first AI writing office. Research, verify, draft, critique.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Settings, budget and sandbox state are read per request. There is one user
// and one process, so there is nothing here worth caching.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [settings, budget, sandbox] = await Promise.all([
    readSettings(),
    getBudgetStatus(),
    sandboxEnabled(),
  ]);
  const models = resolveConfiguredModels(settings.model);

  return (
    // The theme is stamped server-side from settings, so there is no flash of
    // the wrong palette and no blocking inline script.
    <html lang="en">
      <body>
        <AppShell
          brandName={APP_NAME}
          model={models.strong}
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
