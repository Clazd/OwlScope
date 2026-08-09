import { z } from "zod";

export const ThemeSchema = z.enum(["light", "dark", "system"]);
export type Theme = z.infer<typeof ThemeSchema>;

export const SettingsSchema = z.object({
  id: z.literal("settings"),
  schemaVersion: z.literal(1),

  model: z.object({
    /** Read-only in the UI for now. One adapter ships in slice 1 by design. */
    provider: z.literal("anthropic"),
    strong: z.string().min(1),
    fast: z.string().min(1),
  }),

  budget: z.object({
    dailyTokenBudget: z.number().int().positive(),
    maxRunsPerDay: z.number().int().positive(),
    cooldownSeconds: z.number().int().min(0),
  }),

  sandbox: z.object({
    enabled: z.boolean(),
  }),

  appearance: z.object({
    theme: ThemeSchema,
  }),

  sync: z.object({
    lastPullAt: z.string().nullable(),
    lastPushAt: z.string().nullable(),
  }),

  updatedAt: z.string(),
});

export type Settings = z.infer<typeof SettingsSchema>;

/**
 * Model names are deliberately not hard-coded anywhere else. These are only
 * the values a fresh install starts with; Settings edits them as free text.
 */
export const DEFAULT_SETTINGS: Settings = {
  id: "settings",
  schemaVersion: 1,
  model: {
    provider: "anthropic",
    strong: "claude-opus-4-6",
    fast: "claude-haiku-4-5-20251001",
  },
  budget: {
    dailyTokenBudget: 200_000,
    maxRunsPerDay: 20,
    cooldownSeconds: 10,
  },
  sandbox: { enabled: false },
  appearance: { theme: "system" },
  sync: { lastPullAt: null, lastPushAt: null },
  updatedAt: new Date(0).toISOString(),
};

/** Everything the browser is allowed to know. Never includes the API key. */
export const PublicSettingsSchema = SettingsSchema;
export type PublicSettings = Settings;
