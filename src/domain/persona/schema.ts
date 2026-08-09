import { z } from "zod";

/**
 * Brain is a structured record, not one giant system-prompt textarea.
 *
 * Every file under /data/persona has a schema here. Reads validate, writes
 * validate, and a file that fails either is quarantined rather than crashing a
 * page — that is inherited from the storage layer, not reimplemented.
 */

/* ------------------------------------------------------------- identity -- */

export const FreshnessSchema = z.enum(["fresh", "balanced", "evergreen"]);
export type Freshness = z.infer<typeof FreshnessSchema>;

export const PillarSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  /** 0–100. Enabled pillars always sum to 100. */
  weight: z.number().min(0).max(100),
  enabled: z.boolean(),
  freshnessPreference: FreshnessSchema,
  subtopics: z.array(z.string()),
});
export type Pillar = z.infer<typeof PillarSchema>;

export const BeliefStrengthSchema = z.enum(["mild", "moderate", "strong"]);
export type BeliefStrength = z.infer<typeof BeliefStrengthSchema>;

export const BeliefSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  strength: BeliefStrengthSchema,
  /** The pillar this belief sits under, or null for a general stance. */
  pillarId: z.string().nullable(),
  enabled: z.boolean(),
});
export type Belief = z.infer<typeof BeliefSchema>;

/**
 * `kind` separates the fixed exclusions a classifier can check mechanically
 * from free-text rules that need a model to judge. A boundary check fires
 * before writing, so it has to be checkable at topic level.
 */
export const BoundaryKindSchema = z.enum([
  "politics",
  "religion",
  "celebrity-gossip",
  "nsfw",
  "financial-advice",
  "medical-advice",
  "custom",
]);
export type BoundaryKind = z.infer<typeof BoundaryKindSchema>;

export const BoundarySchema = z.object({
  id: z.string().min(1),
  kind: BoundaryKindSchema,
  /** Human-readable subject. For the fixed kinds this is a stock label. */
  value: z.string().min(1),
  enabled: z.boolean(),
});
export type Boundary = z.infer<typeof BoundarySchema>;

export const VoiceRuleTypeSchema = z.enum(["never", "prefer"]);
export type VoiceRuleType = z.infer<typeof VoiceRuleTypeSchema>;

export const VoiceRuleSchema = z.object({
  id: z.string().min(1),
  rule: z.string().min(1),
  ruleType: VoiceRuleTypeSchema,
  enabled: z.boolean(),
});
export type VoiceRule = z.infer<typeof VoiceRuleSchema>;

/* -------------------------------------------------- sliders and switches -- */

/** Normalised 0–100. Low value is the first pole, high value is the second. */
export const SLIDER_DIMENSIONS = [
  { key: "casualFormal", low: "Casual", high: "Formal" },
  { key: "conciseDetailed", low: "Concise", high: "Detailed" },
  { key: "seriousHumorous", low: "Serious", high: "Humorous" },
  { key: "neutralOpinionated", low: "Neutral", high: "Opinionated" },
  { key: "technicalAccessible", low: "Technical", high: "Accessible" },
  { key: "reservedEnergetic", low: "Reserved", high: "Energetic" },
] as const;

export type SliderKey = (typeof SLIDER_DIMENSIONS)[number]["key"];

const slider = z.number().int().min(0).max(100);

export const SlidersSchema = z.object({
  casualFormal: slider,
  conciseDetailed: slider,
  seriousHumorous: slider,
  neutralOpinionated: slider,
  technicalAccessible: slider,
  reservedEnergetic: slider,
});
export type Sliders = z.infer<typeof SlidersSchema>;

export const SWITCH_KEYS = [
  { key: "emojis", label: "Emojis" },
  { key: "hashtags", label: "Hashtags" },
  { key: "questions", label: "Questions" },
  { key: "threads", label: "Threads" },
  { key: "firstPerson", label: "First-person voice" },
  { key: "strongHooks", label: "Strong hooks" },
  { key: "technicalTerminology", label: "Technical terminology" },
] as const;

export type SwitchKey = (typeof SWITCH_KEYS)[number]["key"];

export const SwitchesSchema = z.object({
  emojis: z.boolean(),
  hashtags: z.boolean(),
  questions: z.boolean(),
  threads: z.boolean(),
  firstPerson: z.boolean(),
  strongHooks: z.boolean(),
  technicalTerminology: z.boolean(),
});
export type Switches = z.infer<typeof SwitchesSchema>;

/* ---------------------------------------------------------------- persona -- */

export const PersonaSchema = z.object({
  id: z.literal("persona"),
  schemaVersion: z.literal(1),
  name: z.string(),
  description: z.string(),
  primaryLanguage: z.string(),
  secondaryLanguage: z.string().nullable(),
  audience: z.string(),
  focus: z.string().nullable(),
  identityStatement: z.string(),
  /** The version number that generated posts record. 0 until the first save. */
  activeVersion: z.number().int().min(0),
  /** Set once onboarding has been completed at least once. */
  onboardingComplete: z.boolean(),
  pillars: z.array(PillarSchema),
  beliefs: z.array(BeliefSchema),
  boundaries: z.array(BoundarySchema),
  voiceRules: z.array(VoiceRuleSchema),
  sliders: SlidersSchema,
  switches: SwitchesSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Persona = z.infer<typeof PersonaSchema>;

/* ---------------------------------------------------------------- samples -- */

export const SampleModeSchema = z.enum(["mine", "admired"]);
export type SampleMode = z.infer<typeof SampleModeSchema>;

export const SampleSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  /**
   * "mine" is the user's own writing. "admired" belongs to someone else and is
   * a source of cadence and structure ONLY — never of opinions or claims.
   */
  mode: SampleModeSchema,
  createdAt: z.string(),
});
export type Sample = z.infer<typeof SampleSchema>;

/** samples.json is one document holding the list, not one file per sample. */
export const SampleSetSchema = z.object({
  id: z.literal("samples"),
  samples: z.array(SampleSchema),
  updatedAt: z.string(),
});
export type SampleSet = z.infer<typeof SampleSetSchema>;

/* ------------------------------------------------------------ fingerprint -- */

export const FrequencySchema = z.enum(["never", "rare", "common"]);
export type Frequency = z.infer<typeof FrequencySchema>;

export const PresenceSchema = z.enum(["none", "rare", "common"]);
export type Presence = z.infer<typeof PresenceSchema>;

export const SentenceLengthSchema = z.object({
  median: z.number(),
  p10: z.number(),
  p90: z.number(),
});

export const PostLengthSchema = z.object({
  median: z.number(),
  p90: z.number(),
});

export const PunctuationSchema = z.object({
  emDash: FrequencySchema,
  semicolon: FrequencySchema,
  ellipsis: FrequencySchema,
  listMarkers: FrequencySchema,
});
export type Punctuation = z.infer<typeof PunctuationSchema>;

/**
 * The part of the fingerprint a model is allowed to produce: genuinely
 * qualitative reads. Everything countable is computed in code and handed to the
 * model as grounding, because models are bad at counting.
 */
export const QualitativeFingerprintSchema = z.object({
  openingPatterns: z.array(z.string()),
  avoidedOpenings: z.array(z.string()),
  capitalisation: z.string(),
  vocabulary: z.object({
    preferred: z.array(z.string()),
    absent: z.array(z.string()),
  }),
  structuralHabits: z.array(z.string()),
});
export type QualitativeFingerprint = z.infer<typeof QualitativeFingerprintSchema>;

export const FingerprintSchema = z.object({
  id: z.literal("fingerprint"),
  // Computed in code.
  sentenceLength: SentenceLengthSchema,
  postLength: PostLengthSchema,
  punctuation: PunctuationSchema,
  emojiUse: PresenceSchema,
  hashtagUse: PresenceSchema,
  // Read by the model.
  openingPatterns: z.array(z.string()),
  avoidedOpenings: z.array(z.string()),
  capitalisation: z.string(),
  vocabulary: z.object({
    preferred: z.array(z.string()),
    absent: z.array(z.string()),
  }),
  structuralHabits: z.array(z.string()),
  // Provenance.
  derivedFromCount: z.number().int().min(0),
  /** True once the user edits any field. Re-analysis then asks before overwriting. */
  editedByUser: z.boolean(),
  createdAt: z.string(),
});
export type Fingerprint = z.infer<typeof FingerprintSchema>;

/* ------------------------------------------------------------- experience -- */

export const ExperienceItemSchema = z.object({
  id: z.string().min(1),
  item: z.string().min(1),
  detail: z.string(),
  /** Free text: "March 2026", "last year". Precision is not the point. */
  occurredAt: z.string(),
});
export type ExperienceItem = z.infer<typeof ExperienceItemSchema>;

export const ExperienceLogSchema = z.object({
  id: z.literal("experience"),
  items: z.array(ExperienceItemSchema),
  updatedAt: z.string(),
});
export type ExperienceLog = z.infer<typeof ExperienceLogSchema>;

/* --------------------------------------------------------------- versions -- */

export const PersonaSnapshotSchema = z.object({
  persona: PersonaSchema,
  fingerprint: FingerprintSchema.nullable(),
  samples: z.array(SampleSchema),
  experience: z.array(ExperienceItemSchema),
});
export type PersonaSnapshot = z.infer<typeof PersonaSnapshotSchema>;

export const PersonaVersionSchema = z.object({
  /** `v001`, `v002`. Zero-padded so the directory sorts. */
  id: z.string().regex(/^v\d{3,}$/),
  version: z.number().int().positive(),
  changeReason: z.string(),
  changeCount: z.number().int().min(0),
  createdAt: z.string(),
  /** A full snapshot, not a delta. Disk is free; reconstructing deltas is not. */
  snapshot: PersonaSnapshotSchema,
});
export type PersonaVersion = z.infer<typeof PersonaVersionSchema>;

export function versionId(version: number): string {
  return `v${String(version).padStart(3, "0")}`;
}
