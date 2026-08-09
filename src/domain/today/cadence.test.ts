import { describe, expect, it } from "vitest";
import type { Pillar } from "@/domain/persona/schema";
import type { ContentItem, Topic } from "@/domain/studio/schema";
import { analyseCadence, cadenceDiversityScore, lengthBand, openingPattern, pickCadenceAwareAngle } from "./cadence";

const pillars: Pillar[] = [{ id: "ai", name: "AI", description: "", weight: 100, enabled: true, freshnessPreference: "balanced", subtopics: [] }];
const topic = { id: "t", pillarId: "ai" } as Topic;
function item(id: string, angle = "explanation"): ContentItem {
  return {
    id, topicId: "t", personaVersion: 1, status: "published", angle, thesis: id, text: "Context is not memory.",
    sentences: [], characterCount: 180, fingerprintScore: 80, sourceIds: [], critique: null, validation: null,
    similarity: null, reasoning: "", override: null, rejectionReasons: [], provider: "sandbox", model: "sandbox",
    runId: id, createdAt: `2026-08-0${id}T00:00:00.000Z`, updatedAt: `2026-08-0${id}T00:00:00.000Z`,
    publishedAt: `2026-08-0${id}T00:00:00.000Z`, publicUrl: null,
  };
}

describe("cadence", () => {
  it("classifies length and opening without a model", () => {
    expect(lengthBand(140)).toBe("short");
    expect(lengthBand(221)).toBe("long");
    expect(openingPattern("Why does this fail? It should not.")).toBe("question");
    expect(openingPattern("I shipped the smaller version.")).toBe("first-person");
  });

  it("is zero with fewer than five published posts", () => {
    const result = analyseCadence([item("1"), item("2"), item("3"), item("4")], [topic], pillars);
    expect(result.debts).toEqual([]);
    expect(result.desiredAngle).toBeNull();
    expect(result.missionLine).toContain("only 4 published posts");
    expect(cadenceDiversityScore(result, "ai", pillars)).toBe(50);
  });

  it("detects four repeated explanatory posts and selects a corrective angle", () => {
    const result = analyseCadence([item("5"), item("4"), item("3"), item("2"), item("1")], [topic], pillars);
    expect(result.debts).toContainEqual(expect.objectContaining({ dimension: "angle", value: "explanation" }));
    expect(result.desiredAngle).not.toBe("explanation");
    const selected = pickCadenceAwareAngle([
      { id: "a1", kind: "explanation", thesis: "x", whyItFits: "", evidenceNeeded: [], noveltyRisk: "low", noveltyNote: "" },
      { id: "a2", kind: result.desiredAngle!, thesis: "y", whyItFits: "", evidenceNeeded: [], noveltyRisk: "low", noveltyNote: "" },
    ], result);
    expect(selected?.id).toBe("a2");
    expect(cadenceDiversityScore(result, "ai", pillars)).toBe(20);
  });
});
