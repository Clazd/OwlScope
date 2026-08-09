import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("resetWritingMemory", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "studio-memory-reset-"));
    vi.stubEnv("DATA_DIR", dataDir);
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dataDir, { recursive: true, force: true });
  });

  async function seed(path: string) {
    const full = join(dataDir, path);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, "{}", "utf8");
  }

  async function exists(path: string): Promise<boolean> {
    try {
      await access(join(dataDir, path));
      return true;
    } catch {
      return false;
    }
  }

  it("forgets writing history while preserving identity, research, settings, and audit runs", async () => {
    await Promise.all([
      seed("content/post.json"),
      seed("feedback/post.json"),
      seed("metrics/post.json"),
      seed("exports/memory.json"),
      seed("persona/suggestions/suggestion.json"),
      seed(".cache/today/2026-08-09.json"),
      seed("persona/persona.json"),
      seed("persona/experience.json"),
      seed("settings.json"),
      seed("topics/topic.json"),
      seed("sources/source.json"),
      seed("runs/2026-08-09/run.json"),
    ]);

    const { resetWritingMemory } = await import("./data-admin");
    expect(await resetWritingMemory()).toBe(5);

    for (const forgotten of [
      "content/post.json",
      "feedback/post.json",
      "metrics/post.json",
      "exports/memory.json",
      "persona/suggestions/suggestion.json",
      ".cache/today/2026-08-09.json",
    ]) {
      expect(await exists(forgotten), forgotten).toBe(false);
    }

    for (const preserved of [
      "persona/persona.json",
      "persona/experience.json",
      "settings.json",
      "topics/topic.json",
      "sources/source.json",
      "runs/2026-08-09/run.json",
    ]) {
      expect(await exists(preserved), preserved).toBe(true);
    }
  });
});

