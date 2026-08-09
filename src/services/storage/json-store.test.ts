import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The storage layer resolves its root from DATA_DIR at import time, so each
 * test file points it at a throwaway directory and imports the modules fresh.
 */
let dataDir: string;
let store: typeof import("./json-store");
let atomic: typeof import("./atomic-write");
let indexCache: typeof import("./index-cache");
let z: typeof import("zod").z;

const Widget = () =>
  z.object({
    id: z.string(),
    name: z.string(),
    count: z.number().int(),
  });
type Widget = { id: string; name: string; count: number };

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "studio-store-"));
  process.env.DATA_DIR = dataDir;
  vi.resetModules();
  z = (await import("zod")).z;
  store = await import("./json-store");
  atomic = await import("./atomic-write");
  indexCache = await import("./index-cache");
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

describe("createJsonStore", () => {
  it("round-trips an entity to disk", async () => {
    const widgets = store.createJsonStore<Widget>(join(dataDir, "widgets"), Widget());

    await widgets.put({ id: "1", name: "first", count: 3 });
    const found = await widgets.get("1");

    expect(found).toEqual({ id: "1", name: "first", count: 3 });

    // On disk as pretty-printed JSON, one file per item, so git diffs read.
    const raw = await readFile(join(dataDir, "widgets", "1.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({ id: "1", name: "first", count: 3 });
    expect(raw).toContain("\n  ");
  });

  it("writes atomically, leaving no .tmp file behind", async () => {
    const widgets = store.createJsonStore<Widget>(join(dataDir, "widgets"), Widget());
    await widgets.put({ id: "1", name: "first", count: 1 });
    await atomic.writeQueueIdle();

    const files = await readdir(join(dataDir, "widgets"));
    expect(files).toEqual(["1.json"]);
  });

  it("reports a disk write failure and removes its temporary file", async () => {
    const target = join(dataDir, "blocked.json");
    await mkdir(target, { recursive: true });
    await expect(atomic.atomicWriteText(target, "cannot replace a directory")).rejects.toThrow();
    const files = await readdir(dataDir);
    expect(files.some((file) => file.endsWith(".tmp"))).toBe(false);
  });

  it("treats a missing data directory as an empty fresh clone", async () => {
    const fresh = store.createJsonStore<Widget>(join(dataDir, "not-created-yet"), Widget());
    await expect(fresh.list()).resolves.toEqual([]);
    await expect(fresh.get("missing")).resolves.toBeNull();
  });

  it("serialises concurrent writes rather than interleaving them", async () => {
    const widgets = store.createJsonStore<Widget>(join(dataDir, "widgets"), Widget());

    await Promise.all(
      Array.from({ length: 25 }, (_, i) => widgets.put({ id: String(i), name: `w${i}`, count: i })),
    );

    const all = await widgets.list();
    expect(all).toHaveLength(25);
    // Every file parsed, which means none was read mid-write.
    expect(all.map((w) => w.count).sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i));
  });

  it("quarantines a file that is not valid JSON instead of crashing", async () => {
    const dir = join(dataDir, "widgets");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "broken.json"), "{ not json", "utf8");

    const widgets = store.createJsonStore<Widget>(dir, Widget());
    const all = await widgets.list();

    expect(all).toEqual([]);
    const quarantined = await readdir(join(dataDir, ".cache", "quarantine"));
    expect(quarantined.some((f) => f.endsWith("__widgets__broken.json"))).toBe(true);
    expect(quarantined.some((f) => f.endsWith(".reason.txt"))).toBe(true);
  });

  it("quarantines a file that does not match the schema, with the reason", async () => {
    const dir = join(dataDir, "widgets");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "1.json"), JSON.stringify({ id: "1", name: "x", count: "many" }), "utf8");

    const widgets = store.createJsonStore<Widget>(dir, Widget());
    expect(await widgets.get("1")).toBeNull();

    const quarantineDir = join(dataDir, ".cache", "quarantine");
    const files = await readdir(quarantineDir);
    const reasonFile = files.find((f) => f.endsWith(".reason.txt"));
    expect(reasonFile).toBeDefined();
    const reason = await readFile(join(quarantineDir, reasonFile as string), "utf8");
    expect(reason).toContain("count");
  });

  it("keeps one bad file from hiding the good ones", async () => {
    const dir = join(dataDir, "widgets");
    const widgets = store.createJsonStore<Widget>(dir, Widget());
    await widgets.put({ id: "1", name: "good", count: 1 });
    await writeFile(join(dir, "bad.json"), "nope", "utf8");

    const all = await widgets.list();
    expect(all).toEqual([{ id: "1", name: "good", count: 1 }]);
  });

  it("patches without letting the id change", async () => {
    const widgets = store.createJsonStore<Widget>(join(dataDir, "widgets"), Widget());
    await widgets.put({ id: "1", name: "first", count: 1 });

    const patched = await widgets.patch("1", { count: 9, id: "hacked" } as Partial<Widget>);
    expect(patched).toEqual({ id: "1", name: "first", count: 9 });
    expect(await widgets.get("hacked")).toBeNull();
  });

  it("refuses to patch something that is not there", async () => {
    const widgets = store.createJsonStore<Widget>(join(dataDir, "widgets"), Widget());
    await expect(widgets.patch("missing", { count: 1 })).rejects.toThrow(/No item with id/);
  });

  it("rejects an item that does not match the schema on the way in", async () => {
    const widgets = store.createJsonStore<Widget>(join(dataDir, "widgets"), Widget());
    await expect(widgets.put({ id: "1", name: "x", count: 1.5 } as Widget)).rejects.toThrow();
  });

  it("filters a list by field", async () => {
    const widgets = store.createJsonStore<Widget>(join(dataDir, "widgets"), Widget());
    await widgets.put({ id: "1", name: "a", count: 1 });
    await widgets.put({ id: "2", name: "b", count: 2 });

    expect(await widgets.list({ name: "b" })).toEqual([{ id: "2", name: "b", count: 2 }]);
  });

  it("removes an item", async () => {
    const widgets = store.createJsonStore<Widget>(join(dataDir, "widgets"), Widget());
    await widgets.put({ id: "1", name: "a", count: 1 });
    await widgets.remove("1");
    expect(await widgets.get("1")).toBeNull();
    await expect(widgets.remove("1")).resolves.toBeUndefined();
  });

  it("finds items whose filename is prefixed or date-stamped", async () => {
    const widgets = store.createJsonStore<Widget>(join(dataDir, "content"), Widget(), {
      fileName: (item) => `2026-08-09-${item.id}.json`,
    });
    await widgets.put({ id: "abc", name: "post", count: 1 });

    expect(await widgets.get("abc")).toEqual({ id: "abc", name: "post", count: 1 });
    const files = await readdir(join(dataDir, "content"));
    expect(files).toEqual(["2026-08-09-abc.json"]);
  });

  it("reads and writes through nested subdirectories", async () => {
    const widgets = store.createJsonStore<Widget>(join(dataDir, "runs"), Widget(), {
      fileName: (item) => `run-${item.id}.json`,
      subdir: () => "2026-08-09",
      recursive: true,
    });
    await widgets.put({ id: "x", name: "run", count: 1 });

    expect(await widgets.get("x")).toEqual({ id: "x", name: "run", count: 1 });
    expect(await widgets.list()).toHaveLength(1);
  });

  it("refuses a path that escapes the data directory", () => {
    expect(() => store.createJsonStore<Widget>(join(dataDir, "..", "elsewhere"), Widget())).toThrow(
      /outside the data directory/,
    );
  });
});

describe("cache index", () => {
  it("rebuilds from the source files", async () => {
    const widgets = store.createJsonStore<Widget>(join(dataDir, "widgets"), Widget());
    await widgets.put({ id: "1", name: "a", count: 1 });
    await widgets.put({ id: "2", name: "b", count: 2 });

    const index = await indexCache.rebuildIndex();

    expect(index.totalFiles).toBe(2);
    expect(index.totalBytes).toBeGreaterThan(0);
    expect(index.collections.widgets).toHaveLength(2);
    expect(index.collections[".cache"]).toBeUndefined();
  });

  it("rebuilds when the cached file is missing or corrupt", async () => {
    const widgets = store.createJsonStore<Widget>(join(dataDir, "widgets"), Widget());
    await widgets.put({ id: "1", name: "a", count: 1 });

    await mkdir(join(dataDir, ".cache"), { recursive: true });
    await writeFile(join(dataDir, ".cache", "index.json"), "garbage", "utf8");

    const index = await indexCache.getIndex();
    expect(index.totalFiles).toBe(1);
  });
});
