import { describe, expect, it } from "vitest";
import { normaliseWeights, redistributeWeights, setPillarEnabled, weightsSum } from "./weights";
import type { Pillar } from "./schema";

function pillar(id: string, weight: number, enabled = true): Pillar {
  return {
    id,
    name: id.toUpperCase(),
    description: "",
    weight,
    enabled,
    freshnessPreference: "balanced",
    subtopics: [],
  };
}

describe("normaliseWeights", () => {
  it("leaves an already-correct set alone", () => {
    const pillars = [pillar("a", 35), pillar("b", 25), pillar("c", 20), pillar("d", 10), pillar("e", 10)];
    expect(normaliseWeights(pillars).map((p) => p.weight)).toEqual([35, 25, 20, 10, 10]);
  });

  it("scales any set to sum to exactly 100", () => {
    const pillars = [pillar("a", 7), pillar("b", 3), pillar("c", 5)];
    const result = normaliseWeights(pillars);
    expect(weightsSum(result)).toBe(100);
  });

  it("distributes rounding remainder rather than leaving a gap", () => {
    // Three equal pillars cannot be 33.33 each; largest-remainder gives 34/33/33.
    const result = normaliseWeights([pillar("a", 1), pillar("b", 1), pillar("c", 1)]);
    expect(weightsSum(result)).toBe(100);
    expect(result.map((p) => p.weight).sort((a, b) => b - a)).toEqual([34, 33, 33]);
  });

  it("splits evenly when every weight is zero", () => {
    const result = normaliseWeights([pillar("a", 0), pillar("b", 0), pillar("c", 0), pillar("d", 0)]);
    expect(result.map((p) => p.weight)).toEqual([25, 25, 25, 25]);
  });

  it("zeroes disabled pillars and shares 100 among the rest", () => {
    const result = normaliseWeights([pillar("a", 50), pillar("b", 30, false), pillar("c", 50)]);
    expect(result[1]?.weight).toBe(0);
    expect(weightsSum(result)).toBe(100);
    expect(result[0]?.weight).toBe(50);
    expect(result[2]?.weight).toBe(50);
  });

  it("zeroes everything when nothing is enabled", () => {
    const result = normaliseWeights([pillar("a", 50, false), pillar("b", 50, false)]);
    expect(result.every((p) => p.weight === 0)).toBe(true);
    expect(weightsSum(result)).toBe(0);
  });
});

describe("redistributeWeights", () => {
  it("still sums to 100 after a drag", () => {
    const pillars = [pillar("a", 35), pillar("b", 25), pillar("c", 20), pillar("d", 10), pillar("e", 10)];
    const result = redistributeWeights(pillars, "a", 55);
    expect(result.find((p) => p.id === "a")?.weight).toBe(55);
    expect(weightsSum(result)).toBe(100);
  });

  it("takes from the others in proportion, not equally", () => {
    // b holds twice what c holds, so b gives up twice as much.
    const pillars = [pillar("a", 40), pillar("b", 40), pillar("c", 20)];
    const result = redistributeWeights(pillars, "a", 70);
    expect(result.find((p) => p.id === "b")?.weight).toBe(20);
    expect(result.find((p) => p.id === "c")?.weight).toBe(10);
    expect(weightsSum(result)).toBe(100);
  });

  it("clamps a drag past either end", () => {
    const pillars = [pillar("a", 50), pillar("b", 50)];
    expect(redistributeWeights(pillars, "a", 500).find((p) => p.id === "a")?.weight).toBe(100);
    expect(redistributeWeights(pillars, "a", -20).find((p) => p.id === "a")?.weight).toBe(0);
    expect(weightsSum(redistributeWeights(pillars, "a", -20))).toBe(100);
  });

  it("gives the whole 100 to a lone enabled pillar", () => {
    const pillars = [pillar("a", 40), pillar("b", 60, false)];
    const result = redistributeWeights(pillars, "a", 40);
    expect(result[0]?.weight).toBe(100);
    expect(result[1]?.weight).toBe(0);
  });

  it("never gives a share to a disabled pillar", () => {
    const pillars = [pillar("a", 50), pillar("b", 50), pillar("c", 0, false)];
    const result = redistributeWeights(pillars, "a", 80);
    expect(result.find((p) => p.id === "c")?.weight).toBe(0);
    expect(weightsSum(result)).toBe(100);
  });

  it("shares the remainder evenly when the others are all at zero", () => {
    const pillars = [pillar("a", 100), pillar("b", 0), pillar("c", 0)];
    const result = redistributeWeights(pillars, "a", 50);
    expect(result.find((p) => p.id === "b")?.weight).toBe(25);
    expect(result.find((p) => p.id === "c")?.weight).toBe(25);
    expect(weightsSum(result)).toBe(100);
  });

  it("holds the invariant across a long run of drags", () => {
    let pillars = [pillar("a", 35), pillar("b", 25), pillar("c", 20), pillar("d", 10), pillar("e", 10)];
    const ids = ["a", "b", "c", "d", "e"];
    for (let i = 0; i < 200; i += 1) {
      const id = ids[i % ids.length] as string;
      pillars = redistributeWeights(pillars, id, (i * 37) % 101);
      expect(weightsSum(pillars)).toBe(100);
      expect(pillars.every((p) => p.weight >= 0 && p.weight <= 100)).toBe(true);
    }
  });
});

describe("setPillarEnabled", () => {
  it("redistributes what a disabled pillar was holding", () => {
    const pillars = [pillar("a", 50), pillar("b", 30), pillar("c", 20)];
    const result = setPillarEnabled(pillars, "a", false);
    expect(result.find((p) => p.id === "a")?.weight).toBe(0);
    expect(weightsSum(result)).toBe(100);
  });

  it("gives a re-enabled pillar a share instead of leaving it invisible", () => {
    const off = setPillarEnabled([pillar("a", 50), pillar("b", 50)], "a", false);
    const on = setPillarEnabled(off, "a", true);
    expect(on.find((p) => p.id === "a")?.weight).toBeGreaterThan(0);
    expect(weightsSum(on)).toBe(100);
  });
});
