import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dataDir = mkdtempSync(join(tmpdir(), "studio-today-"));
process.env.DATA_DIR = dataDir;
process.env.SANDBOX_MODE = "true";
process.env.LOG_LEVEL = "error";

let today: typeof import("./today");
let runStore: typeof import("@/services/runs/recorder").runStore;
let contentStore: typeof import("@/domain/studio/store").contentStore;
let sessionStore: typeof import("@/domain/studio/store").sessionStore;
let todayStore: typeof import("@/domain/today/store").todayStore;
let readSettings: typeof import("@/domain/settings/store").readSettings;
let writeSettings: typeof import("@/domain/settings/store").writeSettings;

beforeAll(async () => {
  const [personaStore, demo, orchestration, runs, studioStore, settingsStore, todayStorage] = await Promise.all([
    import("@/domain/persona/store"), import("@/domain/persona/demo"), import("./today"),
    import("@/services/runs/recorder"), import("@/domain/studio/store"), import("@/domain/settings/store"),
    import("@/domain/today/store"),
  ]);
  const snapshot = demo.buildDemoSnapshot("2026-08-09T00:00:00.000Z");
  snapshot.persona.activeVersion = 5;
  await personaStore.writeSnapshot(snapshot);
  today = orchestration;
  runStore = runs.runStore;
  contentStore = studioStore.contentStore;
  sessionStore = studioStore.sessionStore;
  todayStore = todayStorage.todayStore;
  readSettings = settingsStore.readSettings;
  writeSettings = settingsStore.writeSettings;
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("sandbox Today made a network call"); }));
}, 30_000);

afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("Today orchestration", () => {
  it("produces one accepted recommendation under one inspectable run", async () => {
    const now = new Date("2026-08-09T08:00:00.000Z");
    await today.startToday({ idempotencyKey: "today-success", now });
    await today.waitForToday("2026-08-09");
    const record = await today.readToday(now);
    expect(record?.status).toBe("recommendation");
    expect(record?.contentId).toBeTruthy();
    expect(record?.stages.every((stage) => stage.state === "done")).toBe(true);
    const content = await contentStore.get(record?.contentId ?? "");
    expect(content?.status).toBe("accepted");
    expect(content?.publishedAt).toBeNull();
    const session = await sessionStore.get(record?.sessionId ?? "");
    expect(session?.stage).toBe("final");
    expect(Object.values(session?.stageStates ?? {}).every((state) => state === "done")).toBe(true);
    const run = (await runStore.list()).find((item) => item.id === record?.runId);
    expect(run?.kind).toBe("today");
    for (const stage of ["provider:", "research", "angles", "drafts", "validate", "critique", "reasoning"]) {
      expect(run?.stages.some((entry) => entry.stage.startsWith(stage))).toBe(true);
    }
    expect(fetch).not.toHaveBeenCalled();
  }, 30_000);

  it("returns the day's cache without creating a duplicate run", async () => {
    const before = (await runStore.list()).length;
    await today.startToday({ idempotencyKey: "today-second-click", now: new Date("2026-08-09T12:00:00.000Z") });
    expect((await runStore.list()).length).toBe(before);
  });

  it("reattaches after a browser refresh without duplicating an in-flight run", async () => {
    const now = new Date("2026-08-11T08:00:00.000Z");
    const before = (await runStore.list()).length;
    await today.startToday({ idempotencyKey: "today-refresh-first", now });
    await today.startToday({ idempotencyKey: "today-refresh-second", now });
    await today.waitForToday("2026-08-11");
    expect((await runStore.list()).length).toBe(before + 1);
    expect((await today.readToday(now))?.status).toBe("recommendation");
  }, 30_000);

  it("serialises simultaneous cold-open requests into one run", async () => {
    const now = new Date("2026-08-12T08:00:00.000Z");
    const before = (await runStore.list()).length;
    const [first, second] = await Promise.all([
      today.startToday({ idempotencyKey: "today-concurrent-first", now }),
      today.startToday({ idempotencyKey: "today-concurrent-second", now }),
    ]);
    expect(second.runId).toBe(first.runId);
    await today.waitForToday("2026-08-12");
    expect((await runStore.list()).length).toBe(before + 1);
  }, 30_000);

  it("records an honest skip with real run counts", async () => {
    const settings = await readSettings();
    await writeSettings({ ...settings, radar: { ...settings.radar, qualityThreshold: 100 } });
    const now = new Date("2026-08-10T08:00:00.000Z");
    await today.startToday({ idempotencyKey: "today-skip", replace: true, now });
    await today.waitForToday("2026-08-10");
    const record = await today.readToday(now);
    expect(record?.status).toBe("skip");
    expect(record?.skipReason).toMatch(/I looked at \d+ thing/);
    expect(record?.consideredCount).toBeGreaterThan(0);
    expect(record?.contentId).toBeNull();
  }, 30_000);

  it("turns an orphaned running record into a retryable failure at the active stage", async () => {
    const source = await today.readToday(new Date("2026-08-09T08:00:00.000Z"));
    expect(source).toBeTruthy();
    const date = "2026-08-13";
    await todayStore.put({
      ...source!,
      id: date,
      date,
      runId: null,
      status: "running",
      contentId: null,
      failure: null,
      stages: source!.stages.map((stage) => ({
        ...stage,
        state: stage.id === "research" ? "active" as const
          : ["scan", "memory"].includes(stage.id) ? "done" as const : "pending" as const,
      })),
    });

    const recovered = await today.recoverInterruptedToday(new Date("2026-08-13T08:00:00.000Z"));
    expect(recovered?.status).toBe("failed");
    expect(recovered?.failure?.stage).toBe("research");
    expect(recovered?.stages.find((stage) => stage.id === "research")?.state).toBe("failed");
  });
});
