import { describe, expect, it } from "vitest";
import { describeSyncFailure, gitDataSyncEnabled } from "./git";

describe("sync conflict reporting", () => {
  it("names every conflicting path instead of merging or hiding them", () => {
    const result = describeSyncFailure("CONFLICT", ["data/persona/persona.json", "data/content/post.json"]);
    expect(result.conflicts).toEqual(["data/persona/persona.json", "data/content/post.json"]);
    expect(result.message).toContain("data/persona/persona.json");
    expect(result.message).toContain("data/content/post.json");
    expect(result.message).toContain("Resolve them in git");
  });
});

describe("git data sync policy", () => {
  it("requires an explicit true opt-in", () => {
    const previous = process.env.GIT_SYNC_DATA;
    try {
      delete process.env.GIT_SYNC_DATA;
      expect(gitDataSyncEnabled()).toBe(false);
      process.env.GIT_SYNC_DATA = "false";
      expect(gitDataSyncEnabled()).toBe(false);
      process.env.GIT_SYNC_DATA = "true";
      expect(gitDataSyncEnabled()).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.GIT_SYNC_DATA;
      else process.env.GIT_SYNC_DATA = previous;
    }
  });
});
