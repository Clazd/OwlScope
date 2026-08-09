import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "studio-settings-"));
  process.env.DATA_DIR = dataDir;
  vi.resetModules();
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("settings persistence", () => {
  it("writes settings to disk and reads them after a restart", async () => {
    const firstStore = await import("./store");
    const first = await firstStore.readSettings();
    await firstStore.writeSettings({
      ...first,
      budget: { ...first.budget, dailyTokenBudget: 12345 },
      appearance: { theme: "dark" },
    });

    vi.resetModules();
    const secondStore = await import("./store");
    const second = await secondStore.readSettings();

    expect(second.budget.dailyTokenBudget).toBe(12345);
    expect(second.appearance.theme).toBe("dark");
  });

  it("keeps settings when persona data is deleted for a new person", async () => {
    const [{ writeSettings, readSettings }, { DEFAULT_SETTINGS }, personaStore] = await Promise.all([
      import("./store"),
      import("./schema"),
      import("@/domain/persona/store"),
    ]);

    await writeSettings({
      ...DEFAULT_SETTINGS,
      budget: { ...DEFAULT_SETTINGS.budget, maxRunsPerDay: 7 },
    });
    await personaStore.deletePersonaData();

    expect((await readSettings()).budget.maxRunsPerDay).toBe(7);
  });
});
