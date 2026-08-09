import { newId } from "@/lib/ids";
import type { PersonaSnapshot } from "./schema";
import type { PersonaImportOutput } from "./import-schema";
import { normaliseWeights } from "./weights";

function key(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function present(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

/** Exact http(s) links found in the user's paste. No model-produced URL enters this list. */
export function extractPersonaImportUrls(input: string, limit = 5): string[] {
  const matches = input.match(/https?:\/\/[^\s<>"'`]+/gi) ?? [];
  const unique = new Map<string, string>();
  for (const match of matches) {
    const cleaned = match.replace(/[),.;!?\]}]+$/g, "");
    try {
      const url = new URL(cleaned);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      const canonical = url.toString();
      if (!unique.has(canonical)) unique.set(canonical, canonical);
    } catch {
      // A malformed link remains ordinary pasted text. It is never fetched.
    }
    if (unique.size >= limit) break;
  }
  return [...unique.values()];
}

function mergeSubtopics(before: string[], after: string[]): string[] {
  const values = new Map(before.map((value) => [key(value), value.trim()]));
  for (const value of after) {
    if (value.trim()) values.set(key(value), value.trim());
  }
  return [...values.values()];
}

/**
 * Applies an AI proposal to a draft snapshot. It is deliberately additive:
 * matching records may be refined, new records may be added, but absent model
 * output never means delete. The ordinary Brain diff/save flow remains the
 * only way this draft can reach disk.
 */
export function mergePersonaImport(
  base: PersonaSnapshot,
  proposal: PersonaImportOutput,
  allowedUrls: readonly string[],
  makeId: () => string = newId,
): PersonaSnapshot {
  const identity = proposal.identity;
  const persona = { ...base.persona };

  if (present(identity.name)) persona.name = identity.name.trim();
  if (present(identity.description)) persona.description = identity.description.trim();
  if (present(identity.primaryLanguage)) persona.primaryLanguage = identity.primaryLanguage.trim();
  if (identity.secondaryLanguage !== null) {
    persona.secondaryLanguage = identity.secondaryLanguage.trim() || null;
  }
  if (present(identity.audience)) persona.audience = identity.audience.trim();
  if (identity.focus !== null) persona.focus = identity.focus.trim() || null;
  if (present(identity.identityStatement)) persona.identityStatement = identity.identityStatement.trim();

  const pillars = [...persona.pillars];
  for (const incoming of proposal.pillars) {
    const index = pillars.findIndex((pillar) => key(pillar.name) === key(incoming.name));
    if (index >= 0) {
      const current = pillars[index]!;
      pillars[index] = {
        ...current,
        description: incoming.description.trim() || current.description,
        weight: incoming.weight,
        freshnessPreference: incoming.freshnessPreference,
        subtopics: mergeSubtopics(current.subtopics, incoming.subtopics),
        enabled: true,
      };
    } else {
      pillars.push({
        id: makeId(),
        name: incoming.name.trim(),
        description: incoming.description.trim(),
        weight: incoming.weight,
        enabled: true,
        freshnessPreference: incoming.freshnessPreference,
        subtopics: mergeSubtopics([], incoming.subtopics),
      });
    }
  }
  persona.pillars = normaliseWeights(pillars);

  const pillarIds = new Map(pillars.map((pillar) => [key(pillar.name), pillar.id]));
  const beliefs = [...persona.beliefs];
  for (const incoming of proposal.beliefs) {
    const index = beliefs.findIndex((belief) => key(belief.statement) === key(incoming.statement));
    const pillarId = incoming.pillarName ? pillarIds.get(key(incoming.pillarName)) ?? null : null;
    if (index >= 0) {
      beliefs[index] = { ...beliefs[index]!, strength: incoming.strength, pillarId, enabled: true };
    } else {
      beliefs.push({
        id: makeId(),
        statement: incoming.statement.trim(),
        strength: incoming.strength,
        pillarId,
        enabled: true,
      });
    }
  }
  persona.beliefs = beliefs;

  const boundaries = [...persona.boundaries];
  for (const incoming of proposal.boundaries) {
    const index = boundaries.findIndex((boundary) =>
      incoming.kind === "custom"
        ? boundary.kind === "custom" && key(boundary.value) === key(incoming.value)
        : boundary.kind === incoming.kind,
    );
    if (index >= 0) {
      boundaries[index] = { ...boundaries[index]!, value: incoming.value.trim(), enabled: true };
    } else {
      boundaries.push({ id: makeId(), kind: incoming.kind, value: incoming.value.trim(), enabled: true });
    }
  }
  persona.boundaries = boundaries;

  const voiceRules = [...persona.voiceRules];
  for (const incoming of proposal.voiceRules) {
    const index = voiceRules.findIndex((rule) => key(rule.rule) === key(incoming.rule));
    if (index >= 0) {
      voiceRules[index] = { ...voiceRules[index]!, ruleType: incoming.ruleType, enabled: true };
    } else {
      voiceRules.push({
        id: makeId(),
        rule: incoming.rule.trim(),
        ruleType: incoming.ruleType,
        enabled: true,
      });
    }
  }
  persona.voiceRules = voiceRules;

  for (const [dimension, value] of Object.entries(proposal.sliders)) {
    if (value !== null) {
      persona.sliders = { ...persona.sliders, [dimension]: value };
    }
  }
  for (const [switchName, value] of Object.entries(proposal.switches)) {
    if (value !== null) {
      persona.switches = { ...persona.switches, [switchName]: value };
    }
  }

  const allowed = new Set(allowedUrls);
  const experience = [...base.experience];
  for (const incoming of proposal.experience) {
    const sourceUrls = incoming.sourceUrls.filter((url) => allowed.has(url));
    const index = experience.findIndex((item) => key(item.item) === key(incoming.item));
    if (index >= 0) {
      const current = experience[index]!;
      experience[index] = {
        ...current,
        detail: incoming.detail.trim() || current.detail,
        occurredAt: incoming.occurredAt.trim() || current.occurredAt,
        sourceUrls: [...new Set([...(current.sourceUrls ?? []), ...sourceUrls])],
      };
    } else {
      experience.push({
        id: makeId(),
        item: incoming.item.trim(),
        detail: incoming.detail.trim(),
        occurredAt: incoming.occurredAt.trim(),
        sourceUrls,
      });
    }
  }

  const samples = [...base.samples];
  const knownSamples = new Set(samples.map((sample) => key(sample.text)));
  for (const incoming of proposal.writingSamples) {
    if (knownSamples.has(key(incoming.text))) continue;
    samples.push({
      id: makeId(),
      text: incoming.text.trim(),
      mode: incoming.mode,
      createdAt: new Date().toISOString(),
    });
    knownSamples.add(key(incoming.text));
  }

  return { ...base, persona, experience, samples };
}
