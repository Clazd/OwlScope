import { describe, expect, it } from "vitest";
import { emptyPersona } from "./defaults";
import { extractPersonaImportUrls, mergePersonaImport } from "./import-merge";
import type { PersonaImportOutput } from "./import-schema";
import type { PersonaSnapshot } from "./schema";

function proposal(overrides: Partial<PersonaImportOutput> = {}): PersonaImportOutput {
  return {
    summary: "A conservative proposal.",
    identity: {
      name: null,
      description: null,
      primaryLanguage: null,
      secondaryLanguage: null,
      audience: null,
      focus: null,
      identityStatement: null,
    },
    pillars: [],
    beliefs: [],
    boundaries: [],
    voiceRules: [],
    sliders: {
      casualFormal: null,
      conciseDetailed: null,
      seriousHumorous: null,
      neutralOpinionated: null,
      technicalAccessible: null,
      reservedEnergetic: null,
    },
    switches: {
      emojis: null,
      hashtags: null,
      questions: null,
      threads: null,
      firstPerson: null,
      strongHooks: null,
      technicalTerminology: null,
    },
    experience: [],
    writingSamples: [],
    uncertainties: [],
    ignored: [],
    ...overrides,
  };
}

function snapshot(): PersonaSnapshot {
  const persona = emptyPersona("2026-08-09T00:00:00.000Z");
  persona.name = "Existing name";
  persona.pillars = [{
    id: "pillar-1",
    name: "Programming",
    description: "Existing description",
    weight: 100,
    enabled: true,
    freshnessPreference: "balanced",
    subtopics: ["TypeScript"],
  }];
  persona.beliefs = [{
    id: "belief-1",
    statement: "Clarity matters.",
    strength: "mild",
    pillarId: "pillar-1",
    enabled: true,
  }];
  return {
    persona,
    fingerprint: null,
    samples: [],
    experience: [{ id: "experience-1", item: "Built a tool", detail: "Old", occurredAt: "2025" }],
  };
}

describe("persona import URL extraction", () => {
  it("finds exact public-looking links in prose or broken JSON and removes punctuation", () => {
    const input = 'links: ["https://example.com/me", https://example.com/me, https://docs.example.org/work).';
    expect(extractPersonaImportUrls(input)).toEqual([
      "https://example.com/me",
      "https://docs.example.org/work",
    ]);
  });

  it("caps the number of links before any fetch happens", () => {
    const input = Array.from({ length: 8 }, (_, index) => `https://example.com/${index}`).join(" ");
    expect(extractPersonaImportUrls(input)).toHaveLength(5);
  });
});

describe("mergePersonaImport", () => {
  it("is additive, refines duplicates, normalises weights, and keeps omitted identity", () => {
    let nextId = 0;
    const result = mergePersonaImport(
      snapshot(),
      proposal({
        identity: {
          ...proposal().identity,
          audience: "Developers",
          identityStatement: "I explain practical software.",
        },
        pillars: [
          {
            name: "programming",
            description: "Dependable software",
            weight: 60,
            freshnessPreference: "evergreen",
            subtopics: ["TypeScript", "testing"],
          },
          {
            name: "AI",
            description: "Applied AI",
            weight: 40,
            freshnessPreference: "fresh",
            subtopics: ["coding agents"],
          },
        ],
        beliefs: [{ statement: "Clarity matters.", strength: "strong", pillarName: "Programming" }],
      }),
      [],
      () => `new-${++nextId}`,
    );

    expect(result.persona.name).toBe("Existing name");
    expect(result.persona.audience).toBe("Developers");
    expect(result.persona.pillars).toHaveLength(2);
    expect(result.persona.pillars[0]).toMatchObject({
      id: "pillar-1",
      description: "Dependable software",
      freshnessPreference: "evergreen",
      subtopics: ["TypeScript", "testing"],
    });
    expect(result.persona.pillars.reduce((sum, pillar) => sum + pillar.weight, 0)).toBe(100);
    expect(result.persona.beliefs).toHaveLength(1);
    expect(result.persona.beliefs[0]?.strength).toBe("strong");
  });

  it("keeps only user-pasted source URLs and never removes existing records", () => {
    const allowed = "https://example.com/proof";
    const result = mergePersonaImport(
      snapshot(),
      proposal({
        experience: [{
          item: "Built a tool",
          detail: "New detail",
          occurredAt: "2026",
          sourceUrls: [allowed, "https://invented.example/no"],
        }],
        voiceRules: [{ rule: "Prefer concrete examples.", ruleType: "prefer" }],
        writingSamples: [
          { text: "A real post I wrote.", mode: "mine" },
          { text: "a real post i wrote.", mode: "mine" },
        ],
      }),
      [allowed],
      () => "new-id",
    );

    expect(result.experience).toHaveLength(1);
    expect(result.experience[0]).toMatchObject({
      id: "experience-1",
      detail: "New detail",
      occurredAt: "2026",
      sourceUrls: [allowed],
    });
    expect(result.persona.voiceRules.at(-1)?.rule).toBe("Prefer concrete examples.");
    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]).toMatchObject({ text: "A real post I wrote.", mode: "mine" });
    expect(result.persona.boundaries.length).toBe(snapshot().persona.boundaries.length);
  });

  it("applies imported voice controls without needing a manual onboarding pass", () => {
    const result = mergePersonaImport(
      snapshot(),
      proposal({
        voiceRules: [
          { rule: "Prefer short, direct openings.", ruleType: "prefer" },
          { rule: "Never use hype language.", ruleType: "never" },
        ],
        sliders: {
          casualFormal: 25,
          conciseDetailed: 30,
          seriousHumorous: null,
          neutralOpinionated: 80,
          technicalAccessible: null,
          reservedEnergetic: 60,
        },
        switches: {
          emojis: false,
          hashtags: false,
          questions: true,
          threads: true,
          firstPerson: true,
          strongHooks: false,
          technicalTerminology: true,
        },
      }),
      [],
      () => "new-id",
    );

    expect(result.persona.voiceRules.map((rule) => rule.rule)).toContain("Prefer short, direct openings.");
    expect(result.persona.voiceRules.map((rule) => rule.rule)).toContain("Never use hype language.");
    expect(result.persona.sliders).toMatchObject({
      casualFormal: 25,
      conciseDetailed: 30,
      neutralOpinionated: 80,
      reservedEnergetic: 60,
    });
    expect(result.persona.switches.threads).toBe(true);
    expect(result.fingerprint).toBeNull();
  });
});
