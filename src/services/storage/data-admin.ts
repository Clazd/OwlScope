import "server-only";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { createLogger } from "@/lib/logging/log";
import { CACHE_ROOT, DATA_ROOT, assertInsideData } from "./paths";
import { createZip, type ZipEntry } from "./zip";
import { rebuildIndex } from "./index-cache";

const log = createLogger("storage/admin");

async function walkAll(dir: string, skipCache: boolean): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (skipCache && entry.name === ".cache") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkAll(full, skipCache)));
    else out.push(full);
  }
  return out;
}

export interface DataSummary {
  path: string;
  files: number;
  bytes: number;
}

export async function summariseData(): Promise<DataSummary> {
  const files = await walkAll(DATA_ROOT, true);
  let bytes = 0;
  for (const file of files) {
    try {
      bytes += (await stat(file)).size;
    } catch {
      /* a file that vanished mid-walk is not worth failing over */
    }
  }
  return { path: DATA_ROOT, files: files.length, bytes };
}

/** The whole of /data, minus the derived cache, as a zip. */
export async function exportDataZip(): Promise<Buffer> {
  const files = await walkAll(DATA_ROOT, true);
  const entries: ZipEntry[] = [];
  for (const file of files) {
    try {
      const [data, info] = await Promise.all([readFile(file), stat(file)]);
      entries.push({ name: `data/${relative(DATA_ROOT, file)}`, data, modified: info.mtime });
    } catch (err) {
      log.warn(`skipping ${file} in export: ${(err as Error).message}`);
    }
  }
  return createZip(entries);
}

/** Deletes the derived index. Always safe: it is rebuilt from source files. */
export async function clearCache(): Promise<void> {
  assertInsideData(CACHE_ROOT);
  await rm(CACHE_ROOT, { recursive: true, force: true });
  await rebuildIndex();
  log.info("cache cleared and index rebuilt");
}

/**
 * Deletes every data file. Guarded by a typed confirmation in the UI, and by
 * the path assertion here — this function can only ever touch /data.
 */
export async function deleteAllData(): Promise<number> {
  const files = await walkAll(DATA_ROOT, false);
  let removed = 0;
  for (const file of files) {
    if (file.endsWith(".gitkeep")) continue;
    assertInsideData(file);
    await rm(file, { force: true });
    removed += 1;
  }
  await rebuildIndex();
  log.warn(`deleted ${removed} data file(s) at the user's request`);
  return removed;
}
