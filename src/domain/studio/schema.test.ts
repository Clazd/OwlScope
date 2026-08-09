import { describe, expect, it } from "vitest";
import { DraftPayloadSchema, DraftsOutputSchema } from "./schema";

/**
 * The Evidence Lock contract.
 *
 * The reassembly check lives in the schema so that a draft whose flattened text
 * disagrees with its own sentences fails validation like any other malformed
 * response — which means the provider's repair-once-then-fail path handles it
 * with no second mechanism to keep in step.
 */

function sentence(id: string, text: string) {
  return { id, text, claimType: "opinion" as const, sourceIds: [], support: "n/a" as const };
}

describe("DraftPayloadSchema", () => {
  it("accepts a draft whose text is the join of its sentences", () => {
    const result = DraftPayloadSchema.safeParse({
      text: "One thing. Then another.",
      sentences: [sentence("s1", "One thing."), sentence("s2", "Then another.")],
      toneTags: ["direct"],
    });
    expect(result.success).toBe(true);
  });

  it("tolerates a paragraph break, which is formatting rather than content", () => {
    const result = DraftPayloadSchema.safeParse({
      text: "One thing.\n\nThen another.",
      sentences: [sentence("s1", "One thing."), sentence("s2", "Then another.")],
      toneTags: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects text carrying a clause the sentence array does not", () => {
    const result = DraftPayloadSchema.safeParse({
      text: "One thing. Then another. And a third nobody split out.",
      sentences: [sentence("s1", "One thing."), sentence("s2", "Then another.")],
      toneTags: [],
    });
    expect(result.success).toBe(false);
  });

  it("puts the failure on the text field, so the repair prompt points at it", () => {
    const result = DraftPayloadSchema.safeParse({
      text: "Something else entirely.",
      sentences: [sentence("s1", "One thing.")],
      toneTags: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["text"]);
      expect(result.error.issues[0]?.message).toContain("reassemble");
    }
  });

  it("rejects a draft with no sentences at all", () => {
    const result = DraftPayloadSchema.safeParse({ text: "Something.", sentences: [], toneTags: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown claim type rather than coercing it", () => {
    const result = DraftPayloadSchema.safeParse({
      text: "One thing.",
      sentences: [{ id: "s1", text: "One thing.", claimType: "guess", sourceIds: [], support: "n/a" }],
      toneTags: [],
    });
    expect(result.success).toBe(false);
  });

  it("checks every draft in a multi-draft response", () => {
    const good = {
      text: "Fine.",
      sentences: [sentence("s1", "Fine.")],
      toneTags: [],
    };
    const bad = {
      text: "Mismatched entirely.",
      sentences: [sentence("s1", "Not that at all.")],
      toneTags: [],
    };
    expect(DraftsOutputSchema.safeParse({ drafts: [good, good] }).success).toBe(true);
    expect(DraftsOutputSchema.safeParse({ drafts: [good, bad] }).success).toBe(false);
  });
});
