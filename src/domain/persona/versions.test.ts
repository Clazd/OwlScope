import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PersonaSnapshot, Pillar } from "./schema";

let dataDir: string;
let versions: typeof import("./versions");
let store: typeof import("./store");
/**
 * One base persona per test, reused by every snapshot.
 *
 * `emptyPersona()` mints fresh ids for the seed boundaries and voice rules, so
 * calling it twice would look like 13 removals and 13 additions to the differ.
 * Real editing mutates an existing record, and the fixture has to match.
 */
let base: PersonaSnapshot["persona"];

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "studio-persona-"));
  process.env.DATA_DIR = dataDir;
  vi.resetModules();
  versions = await import("./versions");
  store = await import("./store");
  const defaults = await import("./defaults");
  base = defaults.emptyPersona("2026-08-09T00:00:00.000Z");
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

function pillar(id: string, name: string, weight: number): Pillar {
  return { id, name, description: "", weight, enabled: true, freshnessPreference: "balanced", subtopics: [] };
}

function snapshot(overrides: Partial<PersonaSnapshot["persona"]> = {}): PersonaSnapshot {
  return {
    persona: { ...base, name: "Nova", ...overrides },
    fingerprint: null,
    samples: [],
    experience: [],
  };
}

describe("saveAsNewVersion", () => {
  it("writes a version file and points activeVersion at it", async () => {
    const result = await versions.saveAsNewVersion(snapshot(), "First save");

    expect(result.version.version).toBe(1);
    expect(result.version.id).toBe("v001");
    expect(result.snapshot.persona.activeVersion).toBe(1);

    const files = await readdir(join(dataDir, "persona", "versions"));
    expect(files).toEqual(["v001.json"]);

    // And it survives a restart: the store reads it back off disk.
    expect((await store.readPersona())?.activeVersion).toBe(1);
  });

  it("increments on each save without touching the earlier file", async () => {
    await versions.saveAsNewVersion(snapshot(), "First");
    await versions.saveAsNewVersion(snapshot({ name: "Vega" }), "Rename");
    await versions.saveAsNewVersion(snapshot({ name: "Vega", audience: "Engineers" }), "Audience");

    const all = await versions.listVersions();
    expect(all.map((v) => v.version)).toEqual([3, 2, 1]);
    expect((await versions.getVersion(1))?.snapshot.persona.name).toBe("Nova");
    expect((await versions.getVersion(3))?.snapshot.persona.audience).toBe("Engineers");
  });

  it("records the change count that the confirm dialog promised", async () => {
    await versions.saveAsNewVersion(snapshot(), "First");
    const preview = await versions.previewChanges(snapshot({ name: "Vega", audience: "Engineers" }));
    const result = await versions.saveAsNewVersion(snapshot({ name: "Vega", audience: "Engineers" }), "Two edits");

    expect(preview).toHaveLength(2);
    expect(result.version.changeCount).toBe(2);
    expect(result.changes).toHaveLength(2);
  });

  it("normalises pillar weights on the way in, so no version stores a broken sum", async () => {
    const result = await versions.saveAsNewVersion(
      snapshot({ pillars: [pillar("a", "AI", 7), pillar("b", "Programming", 3)] }),
      "Pillars",
    );
    const weights = result.snapshot.persona.pillars.map((p) => p.weight);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(100);
    expect(weights).toEqual([70, 30]);
  });

  it("keeps the change reason", async () => {
    const result = await versions.saveAsNewVersion(snapshot(), "  Tightened the voice rules  ");
    expect(result.version.changeReason).toBe("Tightened the voice rules");
  });

  it("does not reuse a version number after a persona file is replaced", async () => {
    await versions.saveAsNewVersion(snapshot(), "First");
    await versions.saveAsNewVersion(snapshot({ name: "Vega" }), "Second");

    // Simulate a persona.json that lost its activeVersion, as a half-applied
    // save or a bad hand-edit would. The next version must still be 3.
    await store.writePersona({ ...(await store.readPersonaOrEmpty()), activeVersion: 0 });
    const result = await versions.saveAsNewVersion(snapshot({ name: "Lyra" }), "Third");

    expect(result.version.version).toBe(3);
    expect(await versions.getVersion(1)).not.toBeNull();
    expect(await versions.getVersion(2)).not.toBeNull();
  });
});

describe("restoreVersion", () => {
  it("restores forward as a new version instead of rewinding", async () => {
    await versions.saveAsNewVersion(snapshot({ name: "Nova" }), "First");
    await versions.saveAsNewVersion(snapshot({ name: "Vega" }), "Rename");

    const restored = await versions.restoreVersion(1);

    expect(restored.version.version).toBe(3);
    expect(restored.version.changeReason).toBe("Restored version 1");
    expect(restored.snapshot.persona.name).toBe("Nova");
    expect((await store.readPersona())?.activeVersion).toBe(3);
  });

  it("never overwrites or deletes history", async () => {
    await versions.saveAsNewVersion(snapshot({ name: "Nova" }), "First");
    await versions.saveAsNewVersion(snapshot({ name: "Vega" }), "Rename");
    await versions.restoreVersion(1);

    const files = await readdir(join(dataDir, "persona", "versions"));
    expect(files.sort()).toEqual(["v001.json", "v002.json", "v003.json"]);
    expect((await versions.getVersion(2))?.snapshot.persona.name).toBe("Vega");
  });

  it("says which version is missing rather than failing vaguely", async () => {
    await expect(versions.restoreVersion(9)).rejects.toThrow("There is no version 9 on disk.");
  });
});

describe("deletePersonaData", () => {
  it("removes every persona file and every version", async () => {
    await versions.saveAsNewVersion(snapshot(), "First");
    await store.writeSamples([{ id: "s1", text: "A post.", mode: "mine", createdAt: "" }]);
    await store.writeExperience([{ id: "e1", item: "Built a thing", detail: "", occurredAt: "2026" }]);

    await store.deletePersonaData();

    expect(await store.readPersona()).toBeNull();
    expect(await store.readSamples()).toEqual([]);
    expect(await store.readExperience()).toEqual([]);
    expect(await versions.listVersions()).toEqual([]);
    expect(await readdir(join(dataDir, "persona", "versions"))).toEqual([]);
  });
});
