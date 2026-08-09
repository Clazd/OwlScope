import { describe, expect, it } from "vitest";
import { DEFAULT_RADAR_SETTINGS } from "@/domain/settings/schema";
import type { RadarScoreComponents } from "@/domain/studio/schema";
import { meetsThreshold, noveltyFromMatches, scoreLabel, sourceQualityScore, weightedScore } from "./scoring";

const components: RadarScoreComponents = {
  personaRelevance: 80, novelty: 70, freshness: 60, sourceQuality: 90,
  usefulness: 80, angleStrength: 70, claimRisk: 90, diversityContribution: 50,
};

describe("Radar scoring", () => {
  it("uses normalized tunable weights and returns an integer", () => {
    const score = weightedScore(components, DEFAULT_RADAR_SETTINGS.weights);
    expect(score).toBe(75);
    expect(Number.isInteger(score)).toBe(true);
    expect(scoreLabel(score)).toBe("Strong");
  });

  it("ignores freshness for evergreen topics", () => {
    const low = weightedScore({ ...components, freshness: 0 }, DEFAULT_RADAR_SETTINGS.weights, ["freshness"]);
    const high = weightedScore({ ...components, freshness: 100 }, DEFAULT_RADAR_SETTINGS.weights, ["freshness"]);
    expect(low).toBe(high);
  });

  it("turns free similarity into novelty and applies the configured threshold", () => {
    expect(noveltyFromMatches([{ score: 0.72 }])).toBe(28);
    expect(meetsThreshold(62, 62)).toBe(true);
    expect(meetsThreshold(61, 62)).toBe(false);
  });

  it("rewards corroboration across independent source domains", () => {
    expect(sourceQualityScore(["secondary"], ["example.com"])).toBe(80);
    expect(sourceQualityScore(["secondary", "forum", "unknown"], ["example.com", "forum.test", "mirror.test"])).toBe(90);
  });
});
