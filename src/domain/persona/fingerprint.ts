import type { Fingerprint, Persona } from "./schema";
import { SLIDER_DIMENSIONS, SWITCH_KEYS } from "./schema";
import { countWords, postLengthOf, splitSentences } from "./statistics";

/**
 * The two functions slice 3 calls. They live here so the writer and the critic
 * never reach into Brain's internals.
 *
 *   getFingerprintPromptBlock  — a constraint block for the writer prompt
 *   scoreAgainstFingerprint    — 0–100 plus named deviations, zero model calls
 */

/* --------------------------------------------------------- deviations -- */

export type DeviationSeverity = "minor" | "major";

export interface Deviation {
  /** Machine-stable id, for grouping and for tests. */
  rule: string;
  /**
   * Specific and quotable. Not "the tone is off" but "sentence 3 is 41 words,
   * outside your p90 of 24".
   */
  message: string;
  severity: DeviationSeverity;
}

export interface FingerprintScore {
  /** 0–100. 100 means nothing mechanical is out of character. */
  score: number;
  deviations: Deviation[];
  /** True when there was no fingerprint to score against. */
  unscored: boolean;
}

const PENALTY: Record<DeviationSeverity, number> = { minor: 6, major: 15 };

/* ------------------------------------------------------------ detectors -- */

const EMOJI = /\p{Extended_Pictographic}/u;
const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/u;
const EM_DASH = /—|(?:\s--\s)/;
const SEMICOLON = /;/;
const ELLIPSIS = /\.\.\.|…/;
const LIST_MARKER = /(^|\n)\s*(?:[-*•]|\d+[.)])\s+/;

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Does the draft open with one of the patterns the user avoids? */
function matchesAvoidedOpening(text: string, avoided: string): boolean {
  const opening = normalise(text).slice(0, Math.max(40, avoided.length * 2));
  const needle = normalise(avoided);
  return needle.length > 0 && opening.startsWith(needle);
}

/** Whole-word search, so "unlock" does not fire on "unlocked" by accident. */
function containsWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu").test(text);
}

/**
 * Every mechanical check the fingerprint supports. These run in code and cost
 * nothing — a model call is only ever needed for the qualitative read.
 */
export function scoreAgainstFingerprint(text: string, fingerprint: Fingerprint | null): FingerprintScore {
  if (!fingerprint) return { score: 0, deviations: [], unscored: true };

  const deviations: Deviation[] = [];
  const draft = text.trim();

  // Post length.
  const length = postLengthOf(draft);
  if (fingerprint.postLength.p90 > 0 && length > fingerprint.postLength.p90 * 1.15) {
    deviations.push({
      rule: "post-length",
      message: `The post is ${length} characters, past your p90 of ${fingerprint.postLength.p90}.`,
      severity: "minor",
    });
  }

  // Sentence length, named by position so the deviation is actionable.
  const sentences = splitSentences(draft);
  const p90 = fingerprint.sentenceLength.p90;
  if (p90 > 0) {
    sentences.forEach((sentence, i) => {
      const words = countWords(sentence);
      if (words > p90) {
        deviations.push({
          rule: "sentence-length",
          message: `Sentence ${i + 1} is ${words} words, outside your p90 of ${p90}.`,
          severity: words > p90 * 1.5 ? "major" : "minor",
        });
      }
    });
  }

  // Openings the user has said they avoid.
  for (const avoided of fingerprint.avoidedOpenings) {
    if (matchesAvoidedOpening(draft, avoided)) {
      deviations.push({
        rule: "avoided-opening",
        message: `Opening matches your avoided pattern "${avoided}".`,
        severity: "major",
      });
    }
  }

  // Vocabulary the user never uses.
  for (const word of fingerprint.vocabulary.absent) {
    if (containsWord(draft, word)) {
      deviations.push({
        rule: "absent-vocabulary",
        message: `Uses "${word}", which never appears in your samples.`,
        severity: "major",
      });
    }
  }

  // Punctuation habits.
  const punctuationChecks: Array<[keyof typeof fingerprint.punctuation, RegExp, string]> = [
    ["emDash", EM_DASH, "an em dash"],
    ["semicolon", SEMICOLON, "a semicolon"],
    ["ellipsis", ELLIPSIS, "an ellipsis"],
    ["listMarkers", LIST_MARKER, "a list marker"],
  ];
  for (const [key, pattern, label] of punctuationChecks) {
    if (fingerprint.punctuation[key] === "never" && pattern.test(draft)) {
      deviations.push({
        rule: `punctuation-${key}`,
        message: `Contains ${label}, which never appears in your samples.`,
        severity: "minor",
      });
    }
  }

  if (fingerprint.emojiUse === "none" && EMOJI.test(draft)) {
    deviations.push({ rule: "emoji", message: "Contains an emoji. You never use them.", severity: "minor" });
  }
  if (fingerprint.hashtagUse === "none" && HASHTAG.test(draft)) {
    deviations.push({ rule: "hashtag", message: "Contains a hashtag. You never use them.", severity: "minor" });
  }

  const penalty = deviations.reduce((sum, d) => sum + PENALTY[d.severity], 0);
  return { score: Math.max(0, Math.min(100, 100 - penalty)), deviations, unscored: false };
}

/* --------------------------------------------------------- prompt block -- */

function list(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "(none recorded)";
}

/**
 * The constraint block injected into the writer prompt at write time and into
 * the critic prompt at critique time. Plain text, because that is what a prompt
 * is — no JSON for the model to mis-parse back at us.
 */
export function getFingerprintPromptBlock(fingerprint: Fingerprint | null): string {
  if (!fingerprint) {
    return "VOICE FINGERPRINT\nNone recorded. Write plainly and do not invent a stylistic signature.";
  }

  const lines: string[] = [
    "VOICE FINGERPRINT",
    `Derived from ${fingerprint.derivedFromCount} of the user's own posts.${
      fingerprint.editedByUser ? " Hand-corrected by the user; treat it as authoritative." : ""
    }`,
    "",
    `Sentence length: median ${fingerprint.sentenceLength.median} words, typical range ${fingerprint.sentenceLength.p10}–${fingerprint.sentenceLength.p90}. Do not exceed ${fingerprint.sentenceLength.p90} words in a sentence.`,
    `Post length: median ${fingerprint.postLength.median} characters, do not exceed ${fingerprint.postLength.p90}.`,
    `Openings that fit: ${list(fingerprint.openingPatterns)}.`,
    `Openings to never use: ${list(fingerprint.avoidedOpenings)}.`,
    `Capitalisation: ${fingerprint.capitalisation || "sentence case"}.`,
    `Punctuation — em dash: ${fingerprint.punctuation.emDash}; semicolon: ${fingerprint.punctuation.semicolon}; ellipsis: ${fingerprint.punctuation.ellipsis}; list markers: ${fingerprint.punctuation.listMarkers}.`,
    `Emoji: ${fingerprint.emojiUse}. Hashtags: ${fingerprint.hashtagUse}.`,
    `Words that fit: ${list(fingerprint.vocabulary.preferred)}.`,
    `Words to never use: ${list(fingerprint.vocabulary.absent)}.`,
    `Structural habits: ${list(fingerprint.structuralHabits)}.`,
  ];
  return lines.join("\n");
}

/**
 * The identity block. Separate from the fingerprint because they answer
 * different questions: this is what the writer thinks, that is how it sounds.
 */
export function getPersonaPromptBlock(persona: Persona): string {
  const enabledPillars = persona.pillars.filter((p) => p.enabled);
  const enabledBeliefs = persona.beliefs.filter((b) => b.enabled);
  const enabledBoundaries = persona.boundaries.filter((b) => b.enabled);
  const enabledRules = persona.voiceRules.filter((r) => r.enabled);

  const sliderLines = SLIDER_DIMENSIONS.map(
    (d) => `  ${d.low} (0) to ${d.high} (100): ${persona.sliders[d.key]}`,
  );
  const switchLines = SWITCH_KEYS.map((s) => `  ${s.label}: ${persona.switches[s.key] ? "yes" : "no"}`);

  return [
    "IDENTITY",
    persona.identityStatement || "(no identity statement written)",
    persona.audience ? `Audience: ${persona.audience}` : "",
    persona.focus ? `Focus: ${persona.focus}` : "",
    `Language: ${persona.primaryLanguage}${persona.secondaryLanguage ? ` and ${persona.secondaryLanguage}` : ""}`,
    "",
    "PILLARS",
    // Stated as pressure, not quota, because that is how selection actually
    // uses them — the best idea in a 10% pillar still wins.
    "Weights are soft pressure on what to look at, not a quota to fill.",
    ...enabledPillars.map((p) => `  ${p.name} (${p.weight}%, ${p.freshnessPreference})${p.description ? ` — ${p.description}` : ""}`),
    "",
    "BELIEFS you may argue from. Never invent a new permanent belief.",
    ...(enabledBeliefs.length > 0
      ? enabledBeliefs.map((b) => `  [${b.strength}] ${b.statement}`)
      : ["  (none recorded)"]),
    "",
    "BOUNDARIES — hard blocks. Refuse a topic that touches these.",
    ...(enabledBoundaries.length > 0 ? enabledBoundaries.map((b) => `  ${b.value}`) : ["  (none set)"]),
    "",
    "VOICE RULES",
    ...(enabledRules.length > 0
      ? enabledRules.map((r) => `  ${r.ruleType === "never" ? "NEVER" : "PREFER"}: ${r.rule}`)
      : ["  (none set)"]),
    "",
    "ADJUSTMENTS beyond the samples",
    ...sliderLines,
    ...switchLines,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * The experience log, stated as a closed list.
 *
 * This is the structural half of "never fake anything": the writer may only
 * claim first-hand experience that appears here, and everything else is
 * observation. A prompt line alone would drift; a closed list does not.
 */
export function getExperiencePromptBlock(items: Array<{ item: string; detail: string; occurredAt: string }>): string {
  if (items.length === 0) {
    return [
      "FIRST-HAND EXPERIENCE",
      "The experience log is empty. You have not personally used anything.",
      "Write only as an observer. Never claim to have tried, built, or used a product.",
    ].join("\n");
  }
  return [
    "FIRST-HAND EXPERIENCE — the complete list. Nothing outside it may be claimed as first-hand.",
    ...items.map((e) => `  ${e.item}${e.detail ? ` — ${e.detail}` : ""}${e.occurredAt ? ` (${e.occurredAt})` : ""}`),
    "Anything not on this list is observation, and must be written as observation.",
  ].join("\n");
}
