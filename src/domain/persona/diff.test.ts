import { describe, expect, it } from "vitest";
import { diffExperience, diffFingerprint, diffPersona, diffSamples, diffSnapshot } from "./diff";
import { emptyPersona } from "./defaults";
import type { Fingerprint, Persona, PersonaSnapshot, Pillar } from "./schema";

function persona(overrides: Partial<Persona> = {}): Persona {
  return { ...emptyPersona("2026-08-09T00:00:00.000Z"), boundaries: [], voiceRules: [], ...overrides };
}

function pillar(id: string, name: string, weight: number, enabled = true): Pillar {
  return { id, name, description: "", weight, enabled, freshnessPreference: "balanced", subtopics: [] };
}

describe("diffPersona", () => {
  it("finds nothing when nothing changed", () => {
    const before = persona({ name: "Nova" });
    expect(diffPersona(before, { ...before })).toEqual([]);
  });

  it("reports a scalar edit with both sides", () => {
    const before = persona({ name: "Nova" });
    const after = persona({ name: "Vega" });
    expect(diffPersona(before, after)).toEqual([{ field: "Name", before: "Nova", after: "Vega" }]);
  });

  it("treats empty string and null as the same absence", () => {
    const before = persona({ focus: null });
    const after = persona({ focus: "" });
    expect(diffPersona(before, after)).toEqual([]);
  });

  it("reports an added and a removed pillar", () => {
    const before = persona({ pillars: [pillar("a", "AI", 100)] });
    const after = persona({ pillars: [pillar("b", "Programming", 100)] });
    const changes = diffPersona(before, after);
    expect(changes).toContainEqual({ field: "Pillar", before: null, after: "Programming" });
    expect(changes).toContainEqual({ field: "Pillar", before: "AI", after: null });
  });

  it("reports a weight change against the pillar it belongs to", () => {
    const before = persona({ pillars: [pillar("a", "AI", 35), pillar("b", "Programming", 65)] });
    const after = persona({ pillars: [pillar("a", "AI", 40), pillar("b", "Programming", 60)] });
    const changes = diffPersona(before, after);
    expect(changes).toContainEqual({ field: "Pillar · AI · weight", before: "35", after: "40" });
    expect(changes).toContainEqual({ field: "Pillar · Programming · weight", before: "65", after: "60" });
  });

  it("reports a rename as a rename rather than an add plus a remove", () => {
    const before = persona({ pillars: [pillar("a", "AI", 100)] });
    const after = persona({ pillars: [pillar("a", "Artificial intelligence", 100)] });
    expect(diffPersona(before, after)).toEqual([
      { field: "Pillar", before: "AI", after: "Artificial intelligence" },
    ]);
  });

  it("reports slider and switch changes by their human labels", () => {
    const before = persona();
    const after = persona({
      sliders: { ...before.sliders, neutralOpinionated: 80 },
      switches: { ...before.switches, emojis: true },
    });
    const changes = diffPersona(before, after);
    expect(changes).toContainEqual({
      field: "Neutral–Opinionated",
      before: String(before.sliders.neutralOpinionated),
      after: "80",
    });
    expect(changes).toContainEqual({ field: "Emojis", before: "off", after: "on" });
  });

  it("counts a toggled boundary as one change", () => {
    const before = persona({ boundaries: [{ id: "x", kind: "politics", value: "Politics", enabled: false }] });
    const after = persona({ boundaries: [{ id: "x", kind: "politics", value: "Politics", enabled: true }] });
    expect(diffPersona(before, after)).toEqual([
      { field: "Boundary · Politics · enabled", before: "off", after: "on" },
    ]);
  });
});

describe("diffFingerprint", () => {
  const base: Fingerprint = {
    id: "fingerprint",
    sentenceLength: { median: 11, p10: 4, p90: 24 },
    postLength: { median: 180, p90: 260 },
    punctuation: { emDash: "never", semicolon: "never", ellipsis: "rare", listMarkers: "never" },
    emojiUse: "none",
    hashtagUse: "none",
    openingPatterns: ["direct claim"],
    avoidedOpenings: ["Here's the thing"],
    capitalisation: "Sentence case.",
    vocabulary: { preferred: ["shipped"], absent: ["leverage"] },
    structuralHabits: ["claim then example"],
    derivedFromCount: 22,
    editedByUser: false,
    createdAt: "2026-08-09T00:00:00.000Z",
  };

  it("reports a first analysis as an addition", () => {
    expect(diffFingerprint(null, base)).toEqual([
      { field: "Voice fingerprint", before: null, after: "derived from 22 posts" },
    ]);
  });

  it("finds nothing between two identical fingerprints", () => {
    expect(diffFingerprint(base, { ...base })).toEqual([]);
  });

  it("reports an edited avoided opening", () => {
    const after = { ...base, avoidedOpenings: ["Here's the thing", "Unpopular opinion"] };
    expect(diffFingerprint(base, after)).toEqual([
      {
        field: "Openings to avoid",
        before: "Here's the thing",
        after: "Here's the thing · Unpopular opinion",
      },
    ]);
  });

  it("reports a recomputed statistic", () => {
    const after = { ...base, sentenceLength: { ...base.sentenceLength, p90: 31 } };
    expect(diffFingerprint(base, after)).toEqual([
      { field: "Sentence length · p90", before: "24", after: "31" },
    ]);
  });
});

describe("diffSamples and diffExperience", () => {
  it("reports added and removed samples with their mode", () => {
    const before = [{ id: "1", text: "One.", mode: "mine" as const, createdAt: "" }];
    const after = [{ id: "2", text: "Two.", mode: "admired" as const, createdAt: "" }];
    const changes = diffSamples(before, after);
    expect(changes).toContainEqual({ field: "Sample", before: null, after: "admired: Two." });
    expect(changes).toContainEqual({ field: "Sample", before: "mine: One.", after: null });
  });

  it("reports an edited experience detail", () => {
    const before = [{ id: "1", item: "Built a tool", detail: "In Rust", occurredAt: "2025" }];
    const after = [{ id: "1", item: "Built a tool", detail: "In Go", occurredAt: "2025" }];
    expect(diffExperience(before, after)).toEqual([
      { field: "Experience · Built a tool · detail", before: "In Rust", after: "In Go" },
    ]);
  });
});

describe("diffSnapshot", () => {
  it("counts changes across every file so 'N changes' is true", () => {
    const before: PersonaSnapshot = {
      persona: persona({ name: "Nova" }),
      fingerprint: null,
      samples: [],
      experience: [],
    };
    const after: PersonaSnapshot = {
      persona: persona({ name: "Vega", audience: "Engineers" }),
      fingerprint: null,
      samples: [{ id: "1", text: "A post.", mode: "mine", createdAt: "" }],
      experience: [{ id: "e", item: "Shipped something", detail: "", occurredAt: "2026" }],
    };

    const changes = diffSnapshot(before, after);
    expect(changes).toHaveLength(4);
    expect(changes.map((c) => c.field)).toEqual(["Name", "Audience", "Sample", "Experience"]);
  });
});
