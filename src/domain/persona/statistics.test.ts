import { describe, expect, it } from "vitest";
import {
  computeStatistics,
  countWords,
  frequencyFrom,
  median,
  percentile,
  postLengthOf,
  splitSentences,
  statisticsFromSamples,
} from "./statistics";
import type { Sample } from "./schema";

const emDash = "\u2014";

function sample(text: string, mode: Sample["mode"] = "mine"): Sample {
  return { id: `${mode}-${text.slice(0, 6)}`, text, mode, createdAt: "2026-08-09T00:00:00.000Z" };
}

describe("splitSentences", () => {
  it("splits on terminal punctuation and hard line breaks", () => {
    expect(splitSentences("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
    expect(splitSentences("First line\nSecond line")).toEqual(["First line", "Second line"]);
  });

  it("drops empty fragments rather than counting them as sentences", () => {
    expect(splitSentences("  \n\n Hello.  \n ")).toEqual(["Hello."]);
    expect(splitSentences("")).toEqual([]);
  });
});

describe("countWords", () => {
  it("counts words, not tokens of punctuation", () => {
    expect(countWords("Good UX is usually more valuable.")).toBe(6);
    expect(countWords(`Yes ${emDash} really.`)).toBe(2);
    expect(countWords("...")).toBe(0);
  });

  it("counts a URL as one word instead of exploding it", () => {
    expect(countWords("See https://example.com/a/b?c=d for details")).toBe(4);
  });
});

describe("percentile", () => {
  /*
   * Linear interpolation between closest ranks, matching NumPy's default, so
   * these expectations can be checked against any other tool.
   */
  it("interpolates between ranks", () => {
    const values = [1, 2, 3, 4];
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 50)).toBe(2.5);
    expect(percentile(values, 100)).toBe(4);
  });

  it("handles degenerate inputs", () => {
    expect(percentile([], 50)).toBe(0);
    expect(percentile([7], 90)).toBe(7);
  });

  it("computes a median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("computeStatistics", () => {
  /*
   * Acceptance criterion 4: the numeric fields must match a manual count.
   * These three posts are counted by hand in the comments below.
   */
  const posts = [
    // 4 words. 5 words. -> [4, 5]
    "One two three four. Five six seven eight nine.",
    // 3 words. -> [3]
    "Ten eleven twelve.",
    // 10 words. -> [10]
    "A sentence that has exactly ten words in it here.",
  ];

  it("matches a hand count of sentence lengths", () => {
    const stats = computeStatistics(posts);
    // Sorted word counts: [3, 4, 5, 10]
    expect(stats.sentenceCount).toBe(4);
    expect(stats.sentenceLength.median).toBe(4.5);
    expect(stats.sentenceLength.p10).toBe(3.3);
    expect(stats.sentenceLength.p90).toBe(8.5);
  });

  it("matches a hand count of post lengths in characters", () => {
    const stats = computeStatistics(posts);
    const lengths = posts.map((p) => p.length).sort((a, b) => a - b);
    expect(lengths).toEqual([18, 46, 49]);
    expect(stats.postLength.median).toBe(46);
    expect(stats.postLength.p90).toBe(48.4);
  });

  it("counts characters, not code units, for post length", () => {
    // An emoji outside the BMP is one character to a reader and two to .length.
    expect(postLengthOf("ab🙂")).toBe(3);
  });

  it("detects punctuation habits as never / rare / common", () => {
    const stats = computeStatistics([
      "No special punctuation here.",
      "Still nothing unusual.",
      "A third plain post.",
      "This one has a semicolon; right there.",
    ]);
    expect(stats.punctuation.semicolon).toBe("rare");
    expect(stats.punctuation.emDash).toBe("never");
    expect(stats.punctuation.ellipsis).toBe("never");
  });

  it("detects em dashes, ellipses and list markers", () => {
    // One occurrence in three posts is 33%, which is deliberately still "rare".
    // Each pattern gets its own corpus so the frequency is unambiguous.
    expect(computeStatistics([`A thought ${emDash} an aside.`, `Another ${emDash} like this.`]).punctuation.emDash).toBe("common");
    expect(computeStatistics(["Trailing off...", "And again…"]).punctuation.ellipsis).toBe("common");
    expect(computeStatistics(["- one\n- two", "1. first\n2. second"]).punctuation.listMarkers).toBe("common");
  });

  it("holds the line between rare and common at roughly a third of posts", () => {
    const withDash = `A thought ${emDash} an aside.`;
    const plain = "Nothing unusual here.";
    expect(computeStatistics([withDash, plain, plain]).punctuation.emDash).toBe("rare");
    expect(computeStatistics([withDash, withDash, plain]).punctuation.emDash).toBe("common");
  });

  it("detects emoji and hashtags", () => {
    const plain = computeStatistics(["No decoration.", "Still none."]);
    expect(plain.emojiUse).toBe("none");
    expect(plain.hashtagUse).toBe("none");

    const decorated = computeStatistics(["Shipped it 🚀", "Great week #buildinpublic"]);
    expect(decorated.emojiUse).toBe("common");
    expect(decorated.hashtagUse).toBe("common");
  });

  it("does not read a markdown heading as a hashtag", () => {
    const stats = computeStatistics(["#hashtag here", "plain", "plain", "plain"]);
    expect(stats.hashtagUse).toBe("rare");
  });

  it("survives an empty corpus without dividing by zero", () => {
    const stats = computeStatistics([]);
    expect(stats.sentenceLength.median).toBe(0);
    expect(stats.postLength.p90).toBe(0);
    expect(stats.emojiUse).toBe("none");
    expect(stats.sampleCount).toBe(0);
  });
});

describe("frequencyFrom", () => {
  it("treats a single stray post in twenty as not a habit", () => {
    expect(frequencyFrom(0, 20)).toBe("never");
    expect(frequencyFrom(1, 30)).toBe("never");
    expect(frequencyFrom(3, 20)).toBe("rare");
    expect(frequencyFrom(10, 20)).toBe("common");
    expect(frequencyFrom(0, 0)).toBe("never");
  });
});

describe("statisticsFromSamples", () => {
  it("measures the user's own posts, not the ones they admire", () => {
    const stats = statisticsFromSamples([
      sample("Short one."),
      sample("Short two."),
      sample(
        "An admired post that runs on considerably longer than anything the user has ever actually written themselves in practice.",
        "admired",
      ),
    ]);
    expect(stats.basis).toBe("mine");
    expect(stats.sampleCount).toBe(2);
    expect(stats.sentenceLength.p90).toBeLessThan(5);
  });

  it("falls back to admired samples when there are no owned ones", () => {
    const stats = statisticsFromSamples([sample("Someone else wrote this.", "admired")]);
    expect(stats.basis).toBe("admired");
    expect(stats.sampleCount).toBe(1);
  });

  it("reports no basis when there is nothing at all", () => {
    expect(statisticsFromSamples([]).basis).toBe("none");
  });
});
