import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dataDir = mkdtempSync(join(tmpdir(), "studio-radar-"));
process.env.DATA_DIR = dataDir;
process.env.SANDBOX_MODE = "true";
process.env.LOG_LEVEL = "error";

let runRadarScan: typeof import("./scan").runRadarScan;
let runStore: typeof import("@/services/runs/recorder").runStore;

beforeAll(async () => {
  const [personaStore, demo, scan, runs] = await Promise.all([
    import("@/domain/persona/store"), import("@/domain/persona/demo"), import("./scan"), import("@/services/runs/recorder"),
  ]);
  const snapshot = demo.buildDemoSnapshot("2026-08-09T00:00:00.000Z");
  snapshot.persona.activeVersion = 3;
  await personaStore.writeSnapshot(snapshot);
  runRadarScan = scan.runRadarScan;
  runStore = runs.runStore;
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("sandbox Radar made a network call"); }));
});

afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("Radar scan composition", () => {
  it("runs end to end in sandbox with no network and keeps duplicate provenance", async () => {
    const result = await runRadarScan("radar-test-1");
    expect(result.recommendation).toBe("topics");
    expect(result.topics.length).toBeGreaterThan(0);
    expect(result.providers.filter((provider) => provider.status === "ok").length).toBeGreaterThanOrEqual(5);
    const merged = result.topics.find((topic) => result.sources.filter((source) => source.topicId === topic.id).length >= 3);
    expect(merged).toBeDefined();
    expect(result.sources.filter((source) => source.topicId === merged?.id).length).toBeGreaterThanOrEqual(3);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records free novelty and each provider in the Inspector run", async () => {
    const runs = await runStore.list();
    const radar = runs.find((run) => run.idempotencyKey === "radar-test-1");
    expect(radar?.status).toBe("done");
    expect(radar?.stages.some((stage) => stage.stage === "novelty:L1+L2" && stage.model === "none")).toBe(true);
    expect(radar?.stages.filter((stage) => stage.stage.startsWith("provider:")).length).toBe(9);
  });
});
