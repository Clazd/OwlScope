import { z } from "zod";
import {
  BeliefStrengthSchema,
  BoundaryKindSchema,
  FreshnessSchema,
  VoiceRuleTypeSchema,
} from "./schema";

const nullableText = z.string().nullable();
const nullableScore = z.number().int().min(0).max(100).nullable();
const nullableSwitch = z.boolean().nullable();

/**
 * The model returns an additive proposal, never a Persona document. IDs,
 * timestamps, deduplication, allowed URLs and weight normalisation stay in
 * deterministic code.
 */
export const PersonaImportOutputSchema = z.object({
  summary: z.string(),
  identity: z.object({
    name: nullableText,
    description: nullableText,
    primaryLanguage: nullableText,
    secondaryLanguage: nullableText,
    audience: nullableText,
    focus: nullableText,
    identityStatement: nullableText,
  }),
  pillars: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string(),
      weight: z.number().int().min(0).max(100),
      freshnessPreference: FreshnessSchema,
      subtopics: z.array(z.string()).max(12),
    }),
  ).max(5),
  beliefs: z.array(
    z.object({
      statement: z.string().min(1),
      strength: BeliefStrengthSchema,
      pillarName: z.string().nullable(),
    }),
  ).max(20),
  boundaries: z.array(
    z.object({
      kind: BoundaryKindSchema,
      value: z.string().min(1),
    }),
  ).max(12),
  voiceRules: z.array(
    z.object({
      rule: z.string().min(1),
      ruleType: VoiceRuleTypeSchema,
    }),
  ).max(20),
  sliders: z.object({
    casualFormal: nullableScore,
    conciseDetailed: nullableScore,
    seriousHumorous: nullableScore,
    neutralOpinionated: nullableScore,
    technicalAccessible: nullableScore,
    reservedEnergetic: nullableScore,
  }),
  switches: z.object({
    emojis: nullableSwitch,
    hashtags: nullableSwitch,
    questions: nullableSwitch,
    threads: nullableSwitch,
    firstPerson: nullableSwitch,
    strongHooks: nullableSwitch,
    technicalTerminology: nullableSwitch,
  }),
  experience: z.array(
    z.object({
      item: z.string().min(1),
      detail: z.string(),
      occurredAt: z.string(),
      sourceUrls: z.array(z.string()).max(5),
    }),
  ).max(30),
  writingSamples: z.array(
    z.object({
      text: z.string().min(1),
      mode: z.enum(["mine", "admired"]),
    }),
  ).max(40),
  uncertainties: z.array(z.string()).max(20),
  ignored: z.array(z.string()).max(20),
});
export type PersonaImportOutput = z.infer<typeof PersonaImportOutputSchema>;

export const PersonaImportSourceSchema = z.object({
  url: z.string(),
  resolvedUrl: z.string().nullable(),
  title: z.string().nullable(),
  status: z.enum(["read", "not-read", "failed"]),
  message: z.string(),
});
export type PersonaImportSource = z.infer<typeof PersonaImportSourceSchema>;
