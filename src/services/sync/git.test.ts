import { describe, expect, it } from "vitest";
import { describeSyncFailure } from "./git";

describe("sync conflict reporting", () => {
  it("names every conflicting path instead of merging or hiding them", () => {
    const result = describeSyncFailure("CONFLICT", ["data/persona/persona.json", "data/content/post.json"]);
    expect(result.conflicts).toEqual(["data/persona/persona.json", "data/content/post.json"]);
    expect(result.message).toContain("data/persona/persona.json");
    expect(result.message).toContain("data/content/post.json");
    expect(result.message).toContain("Resolve them in git");
  });
});
