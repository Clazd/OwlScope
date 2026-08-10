import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Topic } from "./schema";

const dataDir = mkdtempSync(join(tmpdir(), "studio-research-"));

process.env.DATA_DIR = dataDir;
process.env.SANDBOX_MODE = "true";
process.env.LOG_LEVEL = "error";

let runResearch: typeof import("./research").runResearch;
let beginRun: typeof import("./session").beginRun;
let newId: typeof import("./store").newId;

beforeAll(async () => {
  [{ runResearch }, { beginRun }, { newId }] = await Promise.all([
    import("./research"),
    import("./session"),
    import("./store"),
  ]);
});

afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

function topic(): Topic {
  return {
    id: newId(),
    title: "Structured research failure fallback",
    summary: "A topic with sources but an empty structured model response.",
    sourceType: "manual",
    pillarId: null,
    freshness: "current",
    status: "discovered",
    context: "",
    scoreComponents: null,
    createdAt: new Date().toISOString(),
  };
}

describe("runResearch", () => {
  it("turns an empty structured model result into insufficient research", async () => {
    const run = await beginRun(1, null);

    const result = await runResearch({
      topic: topic(),
      recorder: run.recorder,
      fixtureCase: "empty-object",
    });

    expect(result.sources).toHaveLength(1);
    expect(result.record.sourceIds).toEqual([result.sources[0]?.id]);
    expect(result.record.facts).toEqual([]);
    expect(result.record.insufficient).toBe(true);
    expect(result.record.insufficientReason).toContain("empty structured result");
  });
});
