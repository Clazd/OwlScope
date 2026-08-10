import { z } from "zod";

export const ThemeSchema = z.enum(["light", "dark", "system"]);
export type Theme = z.infer<typeof ThemeSchema>;

export const RADAR_SCORE_KEYS = [
  "personaRelevance",
  "novelty",
  "freshness",
  "sourceQuality",
  "usefulness",
  "angleStrength",
  "claimRisk",
  "diversityContribution",
] as const;

const providerState = z.object({
  enabled: z.boolean(),
  lastRunAt: z.string().nullable(),
  lastStatus: z.enum(["ready", "ok", "degraded", "disabled"]).default("ready"),
  lastResultCount: z.number().int().min(0),
  lastMessage: z.string(),
});

const readyProvider = {
  enabled: true,
  lastRunAt: null,
  lastStatus: "ready" as const,
  lastResultCount: 0,
  lastMessage: "Not run yet.",
};

export const RadarSettingsSchema = z.object({
  providers: z.object({
    nativeModelSearch: providerState,
    hackerNews: providerState,
    reddit: providerState,
    arxiv: providerState,
    github: providerState,
    devCommunity: providerState.default(readyProvider),
    lobsters: providerState.default(readyProvider),
    openAlex: providerState.default(readyProvider),
    rss: providerState,
  }),
  hackerNews: z.object({ minPoints: z.number().int().min(0), keywords: z.array(z.string()) }),
  reddit: z.object({ subreddits: z.array(z.string()) }),
  arxiv: z.object({ categories: z.array(z.string()) }),
  github: z.object({ languages: z.array(z.string()), topics: z.array(z.string()), windowDays: z.number().int().min(1).max(365) }),
  devCommunity: z.object({ tags: z.array(z.string()) }).default({ tags: ["ai", "webdev", "programming", "product"] }),
  lobsters: z.object({ tags: z.array(z.string()) }).default({ tags: ["ai", "programming", "practices"] }),
  openAlex: z.object({ windowDays: z.number().int().min(1).max(3650) }).default({ windowDays: 90 }),
  rss: z.object({ urls: z.array(z.string()) }),
  keywordOverrides: z.record(z.string(), z.array(z.string())),
  qualityThreshold: z.number().int().min(0).max(100),
  noveltyFloor: z.number().int().min(0).max(100),
  bankDecayHours: z.number().int().min(1).max(8760),
  weights: z.object({
    personaRelevance: z.number().min(0),
    novelty: z.number().min(0),
    freshness: z.number().min(0),
    sourceQuality: z.number().min(0),
    usefulness: z.number().min(0),
    angleStrength: z.number().min(0),
    claimRisk: z.number().min(0),
    diversityContribution: z.number().min(0),
  }),
});
export type RadarSettings = z.infer<typeof RadarSettingsSchema>;

export const DEFAULT_RADAR_SETTINGS: RadarSettings = {
  providers: {
    nativeModelSearch: { ...readyProvider },
    hackerNews: { ...readyProvider },
    reddit: { ...readyProvider },
    arxiv: { ...readyProvider },
    github: { ...readyProvider },
    devCommunity: { ...readyProvider },
    lobsters: { ...readyProvider },
    openAlex: { ...readyProvider },
    rss: { ...readyProvider },
  },
  hackerNews: { minPoints: 20, keywords: ["AI agents", "local-first", "developer tools"] },
  reddit: { subreddits: ["MachineLearning", "LocalLLaMA", "programming"] },
  arxiv: { categories: ["cs.AI", "cs.CL", "cs.SE"] },
  github: { languages: ["TypeScript", "Python", "Rust"], topics: ["ai-agents", "local-first"], windowDays: 14 },
  devCommunity: { tags: ["ai", "webdev", "programming", "product"] },
  lobsters: { tags: ["ai", "programming", "practices"] },
  openAlex: { windowDays: 90 },
  rss: { urls: [] },
  keywordOverrides: {},
  qualityThreshold: 62,
  noveltyFloor: 20,
  bankDecayHours: 72,
  weights: {
    personaRelevance: 22,
    novelty: 18,
    freshness: 10,
    sourceQuality: 12,
    usefulness: 14,
    angleStrength: 12,
    claimRisk: 7,
    diversityContribution: 5,
  },
};

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

  memory: z.object({
    /** Minimum relative difference before Patterns shows an observation. */
    patternConfidenceFloor: z.number().min(0.05).max(1),
  }).default({ patternConfidenceFloor: 0.2 }),

  sync: z.object({
    lastPullAt: z.string().nullable(),
    lastPushAt: z.string().nullable(),
  }),

  radar: RadarSettingsSchema.default(DEFAULT_RADAR_SETTINGS),

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
  appearance: { theme: "dark" },
  memory: { patternConfidenceFloor: 0.2 },
  sync: { lastPullAt: null, lastPushAt: null },
  radar: DEFAULT_RADAR_SETTINGS,
  updatedAt: new Date(0).toISOString(),
};

/** Everything the browser is allowed to know. Never includes the API key. */
export const PublicSettingsSchema = SettingsSchema;
export type PublicSettings = Settings;
