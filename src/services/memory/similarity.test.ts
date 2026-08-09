import { describe, expect, it, vi } from "vitest";
import {
  L3_SHORTLIST,
  cosine,
  createSimilarityService,
  jaccard,
  openingOf,
  stem,
  tokenise,
  trigramsOf,
} from "./similarity";
import type { SimilarityHistoryItem, SimilarityInput, SimilarityJudge } from "./similarity";

function candidate(over: Partial<SimilarityInput> = {}): SimilarityInput {
  return {
    id: "",
    text: "Most agent frameworks fail on long tasks because context windows are not memory.",
    topic: "agent frameworks",
    thesis: "Long-horizon failure is a state problem, not a context problem.",
    ...over,
  };
}

function prior(id: string, text: string, thesis = ""): SimilarityHistoryItem {
  return { id, text, topic: "", thesis, vectors: null };
}

/* ------------------------------------------------------------------- L1 -- */

describe("L1 - stemmed token Jaccard", () => {
  it("strips stopwords and stems", () => {
    expect(tokenise("The frameworks are failing on the tasks")).toEqual(["framework", "fail", "task"]);
  });

  it("conflates a plural with its singular", () => {
    expect(stem("frameworks")).toBe(stem("framework"));
  });

  it("does not maul a short word", () => {
    expect(stem("bus")).toBe("bus");
  });

  it("drops URLs, which are not content", () => {
    expect(tokenise("read https://example.com/thing about memory")).toEqual(["read", "memory"]);
  });

  it("scores identical token sets as 1 and disjoint ones as 0", () => {
    expect(jaccard(["a", "b"], ["a", "b"])).toBe(1);
    expect(jaccard(["a"], ["b"])).toBe(0);
  });

  it("scores an empty side as 0 rather than dividing by nothing", () => {
    expect(jaccard([], ["a"])).toBe(0);
  });
});

/* ------------------------------------------------------------------- L2 -- */

describe("L2 - character trigram cosine", () => {
  it("scores identical text as 1", () => {
    const a = trigramsOf("context windows are not memory");
    expect(cosine(a.trigrams, a.norm, a.trigrams, a.norm)).toBeCloseTo(1, 5);
  });

  it("survives a rewrite that word tokens would miss", () => {
    const a = trigramsOf("context windows are not memory");
    const b = trigramsOf("context windows aren't memory");
    const score = cosine(a.trigrams, a.norm, b.trigrams, b.norm);
    expect(score).toBeGreaterThan(0.7);
  });

  it("scores unrelated text low", () => {
    const a = trigramsOf("context windows are not memory");
    const b = trigramsOf("the pastry was excellent and the coffee was not");
    expect(cosine(a.trigrams, a.norm, b.trigrams, b.norm)).toBeLessThan(0.35);
  });

  it("is symmetric", () => {
    const a = trigramsOf("alpha beta gamma");
    const b = trigramsOf("beta gamma delta");
    expect(cosine(a.trigrams, a.norm, b.trigrams, b.norm)).toBeCloseTo(
      cosine(b.trigrams, b.norm, a.trigrams, a.norm),
      10,
    );
  });

  it("scores an empty side as 0", () => {
    const a = trigramsOf("something");
    expect(cosine(a.trigrams, a.norm, {}, 0)).toBe(0);
  });

  it("takes the opening as the first sentence", () => {
    expect(openingOf("First one. Second one. Third.")).toBe("First one.");
  });

  it("falls back to a prefix when there is no terminal punctuation", () => {
    expect(openingOf("no full stop here")).toBe("no full stop here");
  });
});

/* -------------------------------------------------------------- service -- */

describe("the similarity service", () => {
  it("reports low risk against an empty history without doing any work", async () => {
    const service = createSimilarityService();
    const judge = vi.fn();
    const result = await service.compare(candidate(), [], { judge });
    expect(result.risk).toBe("low");
    expect(result.usedModel).toBe(false);
    expect(judge).not.toHaveBeenCalled();
  });

  it("runs L1 and L2 with zero model calls", async () => {
    const service = createSimilarityService();
    const judge = vi.fn();
    const result = await service.compare(
      candidate(),
      [prior("c1", "A post about something else entirely, like pastry.")],
      { judge },
    );
    expect(result.usedModel).toBe(false);
    expect(judge).not.toHaveBeenCalled();
  });

  it("catches an obvious duplicate on the free layers alone", async () => {
    const service = createSimilarityService();
    const judge = vi.fn();
    const mine = candidate();
    const result = await service.compare(mine, [prior("c1", mine.text, mine.thesis)], { judge });
    expect(result.risk).toBe("high");
    // Already certain, so paying a model to confirm it would be waste.
    expect(judge).not.toHaveBeenCalled();
  });

  it("flags a repeated opening even when the rest differs", async () => {
    const service = createSimilarityService();
    const opening = "Most agent frameworks fail on long tasks.";
    const result = await service.compare(
      candidate({ text: `${opening} Here is a completely different second half about deployment pipelines.` }),
      [prior("c1", `${opening} And here is an unrelated tail about pastry and coffee shops in Lisbon.`)],
      {},
    );
    expect(result.matches.some((match) => match.note.includes("opening"))).toBe(true);
    expect(result.risk).toBe("high");
  });

  it("sends at most eight prior posts to L3", async () => {
    const service = createSimilarityService();
    const history = Array.from({ length: 25 }, (_, i) =>
      prior(`c${i}`, "Context windows and agent memory, phrased a little differently each time."),
    );
    // Typed as the interface so the recorded call keeps its shortlist argument.
    const judge = vi.fn<SimilarityJudge>(async () => ({ matches: [] }));

    await service.compare(candidate(), history, { judge });

    expect(judge).toHaveBeenCalledTimes(1);
    const shortlist = judge.mock.calls[0]?.[1] ?? [];
    expect(shortlist.length).toBeLessThanOrEqual(L3_SHORTLIST);
    expect(L3_SHORTLIST).toBe(8);
  });

  it("still compares against the whole history on the free layers", async () => {
    const service = createSimilarityService();
    const history = Array.from({ length: 25 }, (_, i) => prior(`c${i}`, `Post number ${i} about memory.`));
    const result = await service.compare(candidate(), history, {});
    expect(result.comparedAgainst).toBe(25);
  });

  it("ignores an L3 verdict about a post it was not shown", async () => {
    const service = createSimilarityService();
    const judge = vi.fn<SimilarityJudge>(async () => ({
      matches: [{ contentId: "never-shown", score: 0.99, note: "invented" }],
    }));

    const result = await service.compare(
      candidate(),
      [prior("c1", "Agent memory and context, loosely related wording here.")],
      { judge },
    );
    expect(result.matches.every((match) => match.contentId !== "never-shown")).toBe(true);
  });

  it("raises risk when L3 finds the same argument in different words", async () => {
    const service = createSimilarityService();
    const judge = vi.fn<SimilarityJudge>(async () => ({
      matches: [{ contentId: "c1", score: 0.85, note: "Same argument, different words." }],
    }));

    const result = await service.compare(
      candidate(),
      [prior("c1", "Agent memory and context windows, loosely overlapping wording.")],
      { judge },
    );
    expect(result.usedModel).toBe(true);
    expect(result.risk).toBe("high");
  });

  it("stores vectors that can be handed back instead of recomputed", async () => {
    const service = createSimilarityService();
    const mine = candidate();
    const vectors = service.vectorise(mine);
    expect(vectors.l1.tokens.length).toBeGreaterThan(0);
    expect(vectors.l2.norm).toBeGreaterThan(0);

    const withVectors = await service.compare(mine, [{ ...prior("c1", mine.text), vectors }], {});
    const without = await service.compare(mine, [prior("c1", mine.text)], {});
    expect(withVectors.risk).toBe(without.risk);
  });

  it("sorts its tokens, so the stored vector is stable across runs", () => {
    const service = createSimilarityService();
    const tokens = service.vectorise(candidate()).l1.tokens;
    expect([...tokens].sort()).toEqual(tokens);
  });
});

/* ---------------------------------------------------------------- merge -- */

describe("merging a re-checked verdict with an earlier one", () => {
  const result = (
    risk: "low" | "medium" | "high",
    matches: Array<{ contentId: string; layer: "l1" | "l2" | "l3"; score: number; note: string }> = [],
    usedModel = false,
    comparedAgainst = 5,
  ) => ({ risk, matches, usedModel, comparedAgainst });

  it("returns the fresh verdict when there is nothing earlier", async () => {
    const { mergeSimilarity } = await import("@/domain/studio/similarity");
    const fresh = result("low");
    expect(mergeSimilarity(fresh, null)).toBe(fresh);
  });

  it("takes the worse of the two risks", async () => {
    const { mergeSimilarity } = await import("@/domain/studio/similarity");
    // L3 found the same argument at draft time; the cheap re-check cannot see it.
    expect(mergeSimilarity(result("low"), result("high")).risk).toBe("high");
    // And a post published since drafting raises the fresh side instead.
    expect(mergeSimilarity(result("high"), result("low")).risk).toBe("high");
  });

  it("keeps both sets of matches without duplicating one", async () => {
    const { mergeSimilarity } = await import("@/domain/studio/similarity");
    const shared = { contentId: "c1", layer: "l2" as const, score: 0.5, note: "overlap" };
    const merged = mergeSimilarity(
      result("medium", [shared, { contentId: "c2", layer: "l1", score: 0.45, note: "new" }]),
      result("high", [shared, { contentId: "c3", layer: "l3", score: 0.8, note: "same argument" }], true),
    );
    expect(merged.matches.map((match) => match.contentId).sort()).toEqual(["c1", "c2", "c3"]);
    // Sorted worst-first, so the UI shows the closest match at the top.
    expect(merged.matches[0]?.contentId).toBe("c3");
  });

  it("remembers that a model was involved at some point", async () => {
    const { mergeSimilarity } = await import("@/domain/studio/similarity");
    expect(mergeSimilarity(result("low"), result("low", [], true)).usedModel).toBe(true);
  });
});
