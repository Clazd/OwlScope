import "server-only";
import { readSettings, sandboxEnabled, sandboxFromEnv } from "@/domain/settings/store";
import { createAnthropicProvider } from "./anthropic";
import { createSandboxProvider } from "./sandbox";
import { ProviderError, type AIProvider, type ModelTier } from "./types";

export interface ResolvedProvider {
  provider: AIProvider;
  sandbox: boolean;
  /** Why sandbox is on, so the UI can explain a toggle it will not let you flip. */
  sandboxForcedByEnv: boolean;
  models: Record<ModelTier, string>;
}

/**
 * The single place that decides which adapter serves a call. Feature code asks
 * for a provider and gets whichever one the current settings imply — it never
 * branches on sandbox mode itself.
 */
export async function getProvider(): Promise<ResolvedProvider> {
  const settings = await readSettings();
  const models: Record<ModelTier, string> = {
    strong: process.env.AI_MODEL_STRONG || settings.model.strong,
    fast: process.env.AI_MODEL_FAST || settings.model.fast,
  };

  const sandbox = await sandboxEnabled();
  if (sandbox) {
    return {
      provider: createSandboxProvider(models),
      sandbox: true,
      sandboxForcedByEnv: sandboxFromEnv(),
      models,
    };
  }

  const configured = process.env.AI_PROVIDER || "anthropic";
  if (configured !== "anthropic") {
    throw new ProviderError(
      "config",
      `AI_PROVIDER is "${configured}" but only "anthropic" ships in this build. Set AI_PROVIDER=anthropic, or turn on sandbox mode.`,
    );
  }

  return {
    provider: createAnthropicProvider({
      apiKey: process.env.AI_API_KEY ?? "",
      baseUrl: (process.env.AI_BASE_URL || "https://api.anthropic.com").replace(/\/$/, ""),
      models,
    }),
    sandbox: false,
    sandboxForcedByEnv: false,
    models,
  };
}
