import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { createLogger } from "@/lib/logging/log";
import { atomicWriteJson } from "./atomic-write";
import { CACHE_ROOT, DATA_ROOT } from "./paths";

const log = createLogger("storage/index");

const INDEX_FILE = join(CACHE_ROOT, "index.json");

export interface IndexEntry {
  /** Path relative to /data, e.g. `topics/topic-123-abc.json`. */
  file: string;
  id: string;
  bytes: number;
  modifiedAt: string;
}

export interface CacheIndex {
  builtAt: string;
  totalFiles: number;
  totalBytes: number;
  /** Keyed by top-level collection: `topics`, `content`, `runs`, … */
  collections: Record<string, IndexEntry[]>;
}

const EMPTY: CacheIndex = { builtAt: "", totalFiles: 0, totalBytes: 0, collections: {} };

/** `2026-08-09-1754...-x7f2qp.json` -> `1754...-x7f2qp` */
function idFromFileName(name: string): string {
  const base = name.replace(/\.json$/, "");
  const match = base.match(/(\d{10,}-[0-9a-z]{6})$/);
  return match?.[1] ?? base;
}

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    // .cache is derived; indexing it would index the index.
    if (entry.name === ".cache") continue;
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (entry.name.endsWith(".json") && !entry.name.endsWith(".tmp")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Rebuilds the derived index from the source files. Called on boot and after a
 * sync. The index is a convenience for counts and sizes — it is never the
 * source of truth, and it is never committed.
 */
export async function rebuildIndex(): Promise<CacheIndex> {
  const files = await walk(DATA_ROOT);
  const collections: Record<string, IndexEntry[]> = {};
  let totalBytes = 0;

  for (const file of files) {
    const rel = relative(DATA_ROOT, file);
    const collection = rel.includes("/") ? rel.slice(0, rel.indexOf("/")) : "root";
    let s;
    try {
      s = await stat(file);
    } catch {
      continue;
    }
    totalBytes += s.size;
    const entry: IndexEntry = {
      file: rel,
      id: idFromFileName(rel.slice(rel.lastIndexOf("/") + 1)),
      bytes: s.size,
      modifiedAt: s.mtime.toISOString(),
    };
    (collections[collection] ??= []).push(entry);
  }

  for (const list of Object.values(collections)) {
    list.sort((a, b) => a.file.localeCompare(b.file));
  }

  const index: CacheIndex = {
    builtAt: new Date().toISOString(),
    totalFiles: files.length,
    totalBytes,
    collections,
  };

  await mkdir(CACHE_ROOT, { recursive: true });
  await atomicWriteJson(INDEX_FILE, index);
  log.info(`index rebuilt: ${index.totalFiles} files, ${index.totalBytes} bytes`);
  return index;
}

/** Reads the cached index, rebuilding it if it is missing or unreadable. */
export async function getIndex(): Promise<CacheIndex> {
  try {
    const raw = await readFile(INDEX_FILE, "utf8");
    const parsed = JSON.parse(raw) as CacheIndex;
    if (parsed && typeof parsed.builtAt === "string" && parsed.collections) return parsed;
  } catch {
    /* rebuild below */
  }
  try {
    return await rebuildIndex();
  } catch (err) {
    log.error("index rebuild failed", err);
    return EMPTY;
  }
}
