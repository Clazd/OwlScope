import { describe, expect, it } from "vitest";
import {
  X_LIMIT,
  X_URL_WEIGHT,
  characterCountOf,
  checkReassembly,
  countCharacters,
  overLimit,
  reassemble,
  renumber,
} from "./text";

describe("reassembly", () => {
  it("joins sentences with single spaces", () => {
    expect(reassemble([{ text: "One." }, { text: "Two." }])).toBe("One. Two.");
  });

  it("trims each sentence and drops empty ones", () => {
    expect(reassemble([{ text: "  One.  " }, { text: "   " }, { text: "Two." }])).toBe("One. Two.");
  });

  it("accepts text that matches its sentences", () => {
    const sentences = [{ text: "Context windows are not memory." }, { text: "That is the whole point." }];
    expect(checkReassembly("Context windows are not memory. That is the whole point.", sentences).ok).toBe(true);
  });

  it("is insensitive to whitespace, because a line break is a formatting choice", () => {
    const sentences = [{ text: "First." }, { text: "Second." }];
    expect(checkReassembly("First.\n\nSecond.", sentences).ok).toBe(true);
  });

  it("rejects text that has words the sentences do not", () => {
    const sentences = [{ text: "First." }];
    const check = checkReassembly("First. And a clause nobody split out.", sentences);
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("does not reassemble");
  });

  it("rejects sentences that have words the text does not", () => {
    const check = checkReassembly("Only this.", [{ text: "Only this." }, { text: "And this." }]);
    expect(check.ok).toBe(false);
  });

  it("returns the join either way, so the caller always has the authoritative text", () => {
    const check = checkReassembly("wrong", [{ text: "A." }, { text: "B." }]);
    expect(check.reassembled).toBe("A. B.");
  });
});

describe("character counting", () => {
  it("counts plain text", () => {
    expect(countCharacters("hello")).toBe(5);
  });

  it("counts a URL as 23 characters however long it is", () => {
    const long = "https://example.com/an/extremely/long/path/that/goes/on?and=on&and=on";
    expect(long.length).toBeGreaterThan(X_URL_WEIGHT);
    expect(countCharacters(long)).toBe(X_URL_WEIGHT);
  });

  it("charges a short URL the full 23 too", () => {
    expect(countCharacters("http://a.co")).toBe(X_URL_WEIGHT);
  });

  it("adds URL weight to the surrounding text", () => {
    // "See: " is 5, then one URL at 23.
    expect(countCharacters("See: https://example.com")).toBe(5 + X_URL_WEIGHT);
  });

  it("counts a code point once, not its UTF-16 units", () => {
    // "🙂" is two UTF-16 units and one character on the platform.
    expect(countCharacters("🙂")).toBe(1);
    expect("🙂".length).toBe(2);
  });

  it("counts across a sentence array via the reassembled text", () => {
    expect(characterCountOf([{ text: "ab" }, { text: "cd" }])).toBe(5); // "ab cd"
  });

  it("knows where the limit is", () => {
    expect(overLimit("a".repeat(X_LIMIT))).toBe(false);
    expect(overLimit("a".repeat(X_LIMIT + 1))).toBe(true);
  });
});

describe("renumbering", () => {
  it("makes ids positional regardless of what the model returned", () => {
    const { sentences } = renumber([
      { id: "x", text: "One." },
      { id: "x", text: "Two." },
      { id: "banana", text: "Three." },
    ]);
    expect(sentences.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("reports the mapping so cross-references can be rewritten", () => {
    const { remap } = renumber([
      { id: "first", text: "One." },
      { id: "second", text: "Two." },
    ]);
    expect(remap).toEqual({ first: "s1", second: "s2" });
  });

  it("keeps every other field", () => {
    const { sentences } = renumber([{ id: "a", text: "One.", claimType: "fact" }]);
    expect(sentences[0]).toMatchObject({ id: "s1", text: "One.", claimType: "fact" });
  });
});
