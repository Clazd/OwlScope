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
    vi.doUnmock("@/services/ai/provider");
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

  it("tells the person to split a paste that no longer fits in one reply", async () => {
    const { ProviderError } = await import("@/services/ai/types");
    vi.doMock("@/services/ai/provider", () => ({
      getProvider: async () => ({
        sandbox: false,
        sandboxForcedByEnv: false,
        models: { strong: "test-strong", fast: "test-fast" },
        provider: {
          name: "test",
          complete: async () => {
            throw new Error("this stage only calls completeStructured");
          },
          completeStructured: async () => {
            throw new ProviderError(
              "schema",
              "persona-import did not return valid PersonaImportProposal. The reply was cut off at the 8000-token output cap.",
              { truncated: true, tokensIn: 14_000, tokensOut: 8_000 },
            );
          },
          searchCapability: () => ({ supported: false }),
        },
      }),
    }));

    const snapshot: PersonaSnapshot = {
      persona: emptyPersona("2026-08-09T00:00:00.000Z"),
      fingerprint: null,
      samples: [],
      experience: [],
    };

    const { analysePersonaImport } = await import("./import");
    // Long enough that the budget is already at its ceiling, so there is no
    // larger request left to make.
    const paste = "I write about local-first tooling. ".repeat(1_200);

    await expect(analysePersonaImport(paste, snapshot)).rejects.toMatchObject({
      category: "schema",
      truncated: true,
      message: expect.stringContaining("smaller pieces"),
      tokensOut: 8_000,
    });
  });
});

describe("importOutputBudget", () => {
  it("keeps a short paste on the floor", async () => {
    const { importOutputBudget } = await import("./import");

    expect(importOutputBudget(0)).toBe(2_800);
    expect(importOutputBudget(400)).toBe(2_800);
  });

  it("grows with the paste, so a long profile is not cut off mid-JSON", async () => {
    const { importOutputBudget } = await import("./import");

    // The paste that failed at the old fixed 2,800-token cap.
    expect(importOutputBudget(24_079)).toBeGreaterThan(6_000);
    expect(importOutputBudget(12_000)).toBeLessThan(importOutputBudget(24_000));
  });

  it("stops at a cap every configured model accepts", async () => {
    const { importOutputBudget } = await import("./import");

    // The route's own input limit, and anything a caller could pass beyond it.
    expect(importOutputBudget(50_000)).toBe(8_000);
    expect(importOutputBudget(5_000_000)).toBe(8_000);
  });
});

