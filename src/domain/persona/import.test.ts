import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyPersona } from "./defaults";
import type { PersonaSnapshot } from "./schema";

describe("analysePersonaImport", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "studio-persona-import-"));
    vi.stubEnv("DATA_DIR", dataDir);
    vi.stubEnv("SANDBOX_MODE", "true");
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("turns unstructured prose into a reviewable draft using the structured fixture", async () => {
    const snapshot: PersonaSnapshot = {
      persona: emptyPersona("2026-08-09T00:00:00.000Z"),
      fingerprint: null,
      samples: [],
      experience: [],
    };
    snapshot.persona.name = "Nova";

    const { analysePersonaImport } = await import("./import");
    const result = await analysePersonaImport(
      "I build local-first TypeScript tools and explain practical AI to developers.",
      snapshot,
    );

    expect(result.usage.sandbox).toBe(true);
    expect(result.proposal.uncertainties).toHaveLength(1);
    expect(result.snapshot.persona.name).toBe("Nova");
    expect(result.snapshot.persona.pillars.map((pillar) => pillar.name)).toEqual([
      "Programming",
      "Artificial intelligence",
    ]);
    expect(result.snapshot.experience[0]?.item).toBe("Built local-first software tools");
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.runId).toBeTruthy();
  });
});

