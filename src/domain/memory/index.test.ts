import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dataDir: string;
let memory: typeof import("./index");
let feedbackStore: typeof import("@/domain/feedback/store").feedbackStore;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "studio-memory-index-"));
  process.env.DATA_DIR = dataDir;
  vi.resetModules();
  memory = await import("./index");
  feedbackStore = (await import("@/domain/feedback/store")).feedbackStore;
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("Memory index freshness", () => {
  it("reuses an unchanged cache and rebuilds when a source collection changes", async () => {
    await memory.getMemoryIndex();
    const cacheFile = join(dataDir, ".cache", "memory.json");
    const cached = JSON.parse(await readFile(cacheFile, "utf8"));
    cached.builtAt = "2000-01-01T00:00:00.000Z";
    await writeFile(cacheFile, JSON.stringify(cached), "utf8");

    expect((await memory.getMemoryIndex()).builtAt).toBe("2000-01-01T00:00:00.000Z");

    await feedbackStore.put({
      id: "dismissal-1",
      kind: "radar-dismissal",
      topicId: "topic-1",
      title: "A dismissed topic",
      scoreComponents: null,
      createdAt: "2026-08-09T00:00:00.000Z",
    });

    const rebuilt = await memory.getMemoryIndex();
    expect(rebuilt.builtAt).not.toBe("2000-01-01T00:00:00.000Z");
    expect(rebuilt.sourceSignature).not.toBe(cached.sourceSignature);
  });
});
