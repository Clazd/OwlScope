import { newId } from "@/lib/ids";
import type {
  Boundary,
  BoundaryKind,
  Persona,
  Sliders,
  Switches,
  VoiceRule,
} from "./schema";

/**
 * What a fresh persona starts as. Everything here is a starting point the user
 * edits or deletes — nothing in this file is enforced by application code.
 */

export const DEFAULT_SLIDERS: Sliders = {
  casualFormal: 30,
  conciseDetailed: 35,
  seriousHumorous: 35,
  neutralOpinionated: 60,
  technicalAccessible: 50,
  reservedEnergetic: 45,
};

export const DEFAULT_SWITCHES: Switches = {
  emojis: false,
  hashtags: false,
  questions: true,
  threads: false,
  firstPerson: true,
  strongHooks: false,
  technicalTerminology: true,
};

/** The stock exclusions, all off until the user turns them on. */
export const STOCK_BOUNDARIES: Array<{ kind: BoundaryKind; value: string }> = [
  { kind: "politics", value: "Politics" },
  { kind: "religion", value: "Religion" },
  { kind: "celebrity-gossip", value: "Celebrity gossip" },
  { kind: "nsfw", value: "NSFW" },
  { kind: "financial-advice", value: "Financial advice" },
  { kind: "medical-advice", value: "Medical advice" },
];

export function stockBoundaries(enabled: BoundaryKind[] = []): Boundary[] {
  return STOCK_BOUNDARIES.map((b) => ({
    id: newId(),
    kind: b.kind,
    value: b.value,
    enabled: enabled.includes(b.kind),
  }));
}

/**
 * The seed voice rules from the brief. All deletable — they are a starting
 * position on what not to sound like, not a policy.
 */
export const SEED_VOICE_RULES: Array<{ rule: string; ruleType: VoiceRule["ruleType"] }> = [
  { rule: "Never claim to have personally used a product unless it appears in the experience log.", ruleType: "never" },
  { rule: 'Never open with "AI is changing everything."', ruleType: "never" },
  { rule: 'Never write "here are 5 tools."', ruleType: "never" },
  { rule: "No corporate marketing language.", ruleType: "never" },
  { rule: "Do not manufacture outrage.", ruleType: "never" },
  { rule: "Do not state speculation as fact.", ruleType: "never" },
  { rule: "Prefer a concrete observation to motivational advice.", ruleType: "prefer" },
];

export function seedVoiceRules(): VoiceRule[] {
  return SEED_VOICE_RULES.map((r) => ({ id: newId(), rule: r.rule, ruleType: r.ruleType, enabled: true }));
}

export function emptyPersona(now: string = new Date().toISOString()): Persona {
  return {
    id: "persona",
    schemaVersion: 1,
    name: "",
    description: "",
    primaryLanguage: "en",
    secondaryLanguage: null,
    audience: "",
    focus: null,
    identityStatement: "",
    activeVersion: 0,
    onboardingComplete: false,
    pillars: [],
    beliefs: [],
    boundaries: stockBoundaries(),
    voiceRules: seedVoiceRules(),
    sliders: { ...DEFAULT_SLIDERS },
    switches: { ...DEFAULT_SWITCHES },
    createdAt: now,
    updatedAt: now,
  };
}

/** A persona is "started" once it has a name. Used to pick the empty state. */
export function isPersonaStarted(persona: Persona | null): boolean {
  return Boolean(persona && persona.name.trim().length > 0);
}
