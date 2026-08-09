import type { DiffEntry } from "@/components/common/DiffList";
import { SLIDER_DIMENSIONS, SWITCH_KEYS } from "./schema";
import type { ExperienceItem, Fingerprint, Persona, PersonaSnapshot, Sample } from "./schema";

/**
 * Field-level diff between two persona snapshots, for the confirmation shown
 * before a save. "3 changes will create version 7" has to be true, so this
 * counts what actually differs rather than assuming the form is dirty.
 *
 * Entries are keyed by a human-readable field name because that is what the
 * user is being asked to approve — not a JSON pointer.
 */

function scalar(entries: DiffEntry[], field: string, before: unknown, after: unknown) {
  const a = before === null || before === undefined || before === "" ? null : String(before);
  const b = after === null || after === undefined || after === "" ? null : String(after);
  if (a === b) return;
  entries.push({ field, before: a, after: b });
}

/**
 * Compares two keyed collections and reports adds, removes and per-field
 * edits. Used for pillars, beliefs, boundaries, rules, samples and experience.
 */
function collection<T extends { id: string }>(
  entries: DiffEntry[],
  label: string,
  before: T[],
  after: T[],
  describe: (item: T) => string,
  fields?: Array<{ name: string; get: (item: T) => unknown }>,
) {
  const beforeById = new Map(before.map((i) => [i.id, i]));
  const afterById = new Map(after.map((i) => [i.id, i]));

  for (const item of after) {
    const previous = beforeById.get(item.id);
    if (!previous) {
      entries.push({ field: label, before: null, after: describe(item) });
      continue;
    }
    if (describe(previous) !== describe(item)) {
      entries.push({ field: label, before: describe(previous), after: describe(item) });
      continue;
    }
    for (const field of fields ?? []) {
      scalar(entries, `${label} · ${describe(item)} · ${field.name}`, field.get(previous), field.get(item));
    }
  }

  for (const item of before) {
    if (!afterById.has(item.id)) {
      entries.push({ field: label, before: describe(item), after: null });
    }
  }
}

export function diffPersona(before: Persona, after: Persona): DiffEntry[] {
  const entries: DiffEntry[] = [];

  scalar(entries, "Name", before.name, after.name);
  scalar(entries, "Description", before.description, after.description);
  scalar(entries, "Primary language", before.primaryLanguage, after.primaryLanguage);
  scalar(entries, "Secondary language", before.secondaryLanguage, after.secondaryLanguage);
  scalar(entries, "Audience", before.audience, after.audience);
  scalar(entries, "Focus", before.focus, after.focus);
  scalar(entries, "Identity statement", before.identityStatement, after.identityStatement);

  collection(entries, "Pillar", before.pillars, after.pillars, (p) => p.name, [
    { name: "weight", get: (p) => p.weight },
    { name: "enabled", get: (p) => (p.enabled ? "on" : "off") },
    { name: "freshness", get: (p) => p.freshnessPreference },
    { name: "description", get: (p) => p.description },
    { name: "subtopics", get: (p) => p.subtopics.join(", ") },
  ]);

  collection(entries, "Belief", before.beliefs, after.beliefs, (b) => b.statement, [
    { name: "strength", get: (b) => b.strength },
    { name: "enabled", get: (b) => (b.enabled ? "on" : "off") },
  ]);

  collection(entries, "Boundary", before.boundaries, after.boundaries, (b) => b.value, [
    { name: "enabled", get: (b) => (b.enabled ? "on" : "off") },
  ]);

  collection(entries, "Voice rule", before.voiceRules, after.voiceRules, (r) => r.rule, [
    { name: "type", get: (r) => r.ruleType },
    { name: "enabled", get: (r) => (r.enabled ? "on" : "off") },
  ]);

  for (const dimension of SLIDER_DIMENSIONS) {
    scalar(
      entries,
      `${dimension.low}–${dimension.high}`,
      before.sliders[dimension.key],
      after.sliders[dimension.key],
    );
  }

  for (const item of SWITCH_KEYS) {
    scalar(
      entries,
      item.label,
      before.switches[item.key] ? "on" : "off",
      after.switches[item.key] ? "on" : "off",
    );
  }

  return entries;
}

export function diffFingerprint(before: Fingerprint | null, after: Fingerprint | null): DiffEntry[] {
  const entries: DiffEntry[] = [];
  if (!before && !after) return entries;
  if (!before && after) {
    entries.push({ field: "Voice fingerprint", before: null, after: `derived from ${after.derivedFromCount} posts` });
    return entries;
  }
  if (before && !after) {
    entries.push({ field: "Voice fingerprint", before: `derived from ${before.derivedFromCount} posts`, after: null });
    return entries;
  }
  if (!before || !after) return entries;

  scalar(entries, "Sentence length · median", before.sentenceLength.median, after.sentenceLength.median);
  scalar(entries, "Sentence length · p90", before.sentenceLength.p90, after.sentenceLength.p90);
  scalar(entries, "Post length · median", before.postLength.median, after.postLength.median);
  scalar(entries, "Post length · p90", before.postLength.p90, after.postLength.p90);
  scalar(entries, "Openings you use", before.openingPatterns.join(" · "), after.openingPatterns.join(" · "));
  scalar(entries, "Openings to avoid", before.avoidedOpenings.join(" · "), after.avoidedOpenings.join(" · "));
  scalar(entries, "Capitalisation", before.capitalisation, after.capitalisation);
  scalar(entries, "Words you use", before.vocabulary.preferred.join(" · "), after.vocabulary.preferred.join(" · "));
  scalar(entries, "Words you never use", before.vocabulary.absent.join(" · "), after.vocabulary.absent.join(" · "));
  scalar(entries, "Structural habits", before.structuralHabits.join(" · "), after.structuralHabits.join(" · "));
  scalar(entries, "Em dash", before.punctuation.emDash, after.punctuation.emDash);
  scalar(entries, "Semicolon", before.punctuation.semicolon, after.punctuation.semicolon);
  scalar(entries, "Ellipsis", before.punctuation.ellipsis, after.punctuation.ellipsis);
  scalar(entries, "List markers", before.punctuation.listMarkers, after.punctuation.listMarkers);
  scalar(entries, "Emoji", before.emojiUse, after.emojiUse);
  scalar(entries, "Hashtags", before.hashtagUse, after.hashtagUse);

  return entries;
}

function truncate(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function diffSamples(before: Sample[], after: Sample[]): DiffEntry[] {
  const entries: DiffEntry[] = [];
  collection(entries, "Sample", before, after, (s) => `${s.mode}: ${truncate(s.text)}`);
  return entries;
}

export function diffExperience(before: ExperienceItem[], after: ExperienceItem[]): DiffEntry[] {
  const entries: DiffEntry[] = [];
  collection(entries, "Experience", before, after, (e) => e.item, [
    { name: "detail", get: (e) => e.detail },
    { name: "when", get: (e) => e.occurredAt },
    { name: "sources", get: (e) => (e.sourceUrls ?? []).join(", ") },
  ]);
  return entries;
}

/** Everything that would change if this snapshot were saved. */
export function diffSnapshot(before: PersonaSnapshot, after: PersonaSnapshot): DiffEntry[] {
  return [
    ...diffPersona(before.persona, after.persona),
    ...diffFingerprint(before.fingerprint, after.fingerprint),
    ...diffSamples(before.samples, after.samples),
    ...diffExperience(before.experience, after.experience),
  ];
}
