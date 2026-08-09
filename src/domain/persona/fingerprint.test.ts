import { describe, expect, it, vi } from "vitest";
import { getFingerprintPromptBlock, scoreAgainstFingerprint } from "./fingerprint";
import type { Fingerprint } from "./schema";

const BASE: Fingerprint = {
  id: "fingerprint",
  sentenceLength: { median: 11, p10: 4, p90: 24 },
  postLength: { median: 180, p90: 260 },
  punctuation: { emDash: "never", semicolon: "never", ellipsis: "rare", listMarkers: "never" },
  emojiUse: "none",
  hashtagUse: "none",
  openingPatterns: ["direct claim", "concrete observation"],
  avoidedOpenings: ["Here's the thing", "Unpopular opinion", "Let's be honest"],
  capitalisation: "Sentence case throughout.",
  vocabulary: { preferred: ["shipped", "trade-off", "constraint"], absent: ["leverage", "unlock", "game-changer"] },
  structuralHabits: ["claim then example", "no closing call to action"],
  derivedFromCount: 22,
  editedByUser: false,
  createdAt: "2026-08-09T00:00:00.000Z",
};

const emDash = "\u2014";

function fingerprint(overrides: Partial<Fingerprint> = {}): Fingerprint {
  return { ...BASE, ...overrides };
}

describe("scoreAgainstFingerprint", () => {
  it("makes zero model calls - every mechanical check runs in code", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("scoring must not touch the network");
    });
    vi.stubGlobal("fetch", fetchMock);
    scoreAgainstFingerprint("A short post that fits.", fingerprint());
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("scores a post that fits at 100 with no deviations", () => {
    const result = scoreAgainstFingerprint("Shipped a small change today. The trade-off was worth it.", fingerprint());
    expect(result.score).toBe(100);
    expect(result.deviations).toEqual([]);
    expect(result.unscored).toBe(false);
  });

  it("reports being unscored rather than guessing when there is no fingerprint", () => {
    const result = scoreAgainstFingerprint("Anything at all.", null);
    expect(result.unscored).toBe(true);
    expect(result.deviations).toEqual([]);
  });

  it("names the sentence and its length, not just 'too long'", () => {
    const long = `Short one. ${"word ".repeat(41).trim()}.`;
    const result = scoreAgainstFingerprint(long, fingerprint());
    const deviation = result.deviations.find((d) => d.rule === "sentence-length");
    expect(deviation?.message).toBe("Sentence 2 is 41 words, outside your p90 of 24.");
    expect(deviation?.severity).toBe("major");
  });

  it("quotes the avoided opening it matched", () => {
    const result = scoreAgainstFingerprint("Here's the thing, nobody reads the docs.", fingerprint());
    const deviation = result.deviations.find((d) => d.rule === "avoided-opening");
    expect(deviation?.message).toBe(`Opening matches your avoided pattern "Here's the thing".`);
    expect(result.score).toBeLessThan(100);
  });

  it("only fires an avoided opening at the opening", () => {
    const result = scoreAgainstFingerprint("Shipped it. Here's the thing about that.", fingerprint());
    expect(result.deviations.some((d) => d.rule === "avoided-opening")).toBe(false);
  });

  it("names the absent word it found", () => {
    const result = scoreAgainstFingerprint("This will unlock real value.", fingerprint());
    const deviation = result.deviations.find((d) => d.rule === "absent-vocabulary");
    expect(deviation?.message).toBe(`Uses "unlock", which never appears in your samples.`);
  });

  it("matches absent vocabulary on whole words only", () => {
    // "unlocked" is not "unlock"; firing here would be a false positive.
    const result = scoreAgainstFingerprint("The door unlocked itself.", fingerprint());
    expect(result.deviations.some((d) => d.rule === "absent-vocabulary")).toBe(false);
  });

  it("flags punctuation the writer never uses", () => {
    const result = scoreAgainstFingerprint(`A claim ${emDash} and an aside; plus more.`, fingerprint());
    expect(result.deviations.map((d) => d.rule)).toContain("punctuation-emDash");
    expect(result.deviations.map((d) => d.rule)).toContain("punctuation-semicolon");
  });

  it("does not flag punctuation the writer uses rarely", () => {
    const result = scoreAgainstFingerprint("Trailing off...", fingerprint());
    expect(result.deviations.some((d) => d.rule.startsWith("punctuation-"))).toBe(false);
  });

  it("flags emoji and hashtags when the writer uses neither", () => {
    const result = scoreAgainstFingerprint("Shipped it 🚀 #buildinpublic", fingerprint());
    expect(result.deviations.map((d) => d.rule)).toEqual(expect.arrayContaining(["emoji", "hashtag"]));
  });

  it("allows emoji when the fingerprint says they are common", () => {
    const result = scoreAgainstFingerprint("Shipped it 🚀", fingerprint({ emojiUse: "common" }));
    expect(result.deviations.some((d) => d.rule === "emoji")).toBe(false);
  });

  it("flags a post past the length the writer actually writes", () => {
    const result = scoreAgainstFingerprint("x".repeat(400), fingerprint());
    expect(result.deviations.some((d) => d.rule === "post-length")).toBe(true);
  });

  it("gives a little headroom rather than firing at p90 exactly", () => {
    const result = scoreAgainstFingerprint("x".repeat(265), fingerprint());
    expect(result.deviations.some((d) => d.rule === "post-length")).toBe(false);
  });

  it("floors the score at zero however bad the draft is", () => {
    const awful = `Here's the thing 🚀 #hype ${emDash} we will unlock and leverage a game-changer; ${"word ".repeat(60)}...`;
    const result = scoreAgainstFingerprint(awful, fingerprint());
    expect(result.score).toBe(0);
    expect(result.deviations.length).toBeGreaterThan(4);
  });

  it("changes its verdict when an avoided opening is edited", () => {
    // Acceptance criterion 7: editing an avoided opening changes the outcome.
    const text = "Let's be honest, the docs are wrong.";
    expect(scoreAgainstFingerprint(text, fingerprint()).deviations.some((d) => d.rule === "avoided-opening")).toBe(true);

    const relaxed = fingerprint({ avoidedOpenings: ["Here's the thing"] });
    expect(scoreAgainstFingerprint(text, relaxed).deviations.some((d) => d.rule === "avoided-opening")).toBe(false);
  });
});

describe("getFingerprintPromptBlock", () => {
  it("states the hard numbers the writer must not exceed", () => {
    const block = getFingerprintPromptBlock(fingerprint());
    expect(block).toContain("Do not exceed 24 words in a sentence.");
    expect(block).toContain("do not exceed 260");
    expect(block).toContain("Openings to never use: Here's the thing, Unpopular opinion, Let's be honest.");
    expect(block).toContain("Words to never use: leverage, unlock, game-changer.");
  });

  it("says so plainly when there is no fingerprint, instead of inventing one", () => {
    const block = getFingerprintPromptBlock(null);
    expect(block).toContain("None recorded");
    expect(block).toContain("do not invent a stylistic signature");
  });

  it("tells the writer when the user has hand-corrected it", () => {
    expect(getFingerprintPromptBlock(fingerprint({ editedByUser: true }))).toContain("Hand-corrected by the user");
    expect(getFingerprintPromptBlock(fingerprint())).not.toContain("Hand-corrected");
  });

  it("does not pretend empty lists are populated", () => {
    const block = getFingerprintPromptBlock(fingerprint({ avoidedOpenings: [], vocabulary: { preferred: [], absent: [] } }));
    expect(block).toContain("Openings to never use: (none recorded).");
  });
});
