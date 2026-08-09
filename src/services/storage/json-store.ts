import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ZodType } from "zod";
import { createLogger } from "@/lib/logging/log";
import { atomicWriteJson } from "./atomic-write";
import { assertInsideData } from "./paths";
import { quarantineFile } from "./quarantine";

const log = createLogger("storage/json-store");

/** Every entity in the product is identified the same way. */
export interface Entity {
  id: string;
}

export interface Store<T extends Entity> {
  get(id: string): Promise<T | null>;
  list(filter?: Partial<T>): Promise<T[]>;
  put(item: T): Promise<T>;
  patch(id: string, changes: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface JsonStoreOptions<T extends Entity> {
  /** Filename for an item, without directories. Defaults to `<id>.json`. */
  fileName?: (item: T) => string;
  /** Directory below the store root, e.g. a run's date folder. */
  subdir?: (item: T) => string;
  /** Whether reads walk nested directories. Implied by `subdir`. */
  recursive?: boolean;
}

export interface JsonStore<T extends Entity> extends Store<T> {
  /** Absolute path of the item's file, or null when it is not on disk. */
  pathOf(id: string): Promise<string | null>;
  /** All item files under the store root, absolute, sorted. */
  files(): Promise<string[]>;
  readonly dir: string;
}

async function listJsonFiles(dir: string, recursive: boolean): Promise<string[]> {
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
    if (entry.isDirectory()) {
      if (recursive) out.push(...(await listJsonFiles(full, recursive)));
      continue;
    }
    // .tmp files are half-written by definition, and .gitkeep is structure.
    if (!entry.name.endsWith(".json")) continue;
    if (entry.name.endsWith(".tmp")) continue;
    out.push(full);
  }
  return out.sort();
}

function matchesFilter<T extends Entity>(item: T, filter: Partial<T>): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    if (expected === undefined) continue;
    if (item[key as keyof T] !== expected) return false;
  }
  return true;
}

/**
 * The one and only persistence primitive. Every entity uses it; feature code
 * never touches `fs`. If a real database is ever needed, this file is the only
 * one that changes.
 */
export function createJsonStore<T extends Entity>(
  dir: string,
  schema: ZodType<T>,
  options: JsonStoreOptions<T> = {},
): JsonStore<T> {
  assertInsideData(dir);
  const root = resolve(dir);
  const recursive = options.recursive ?? Boolean(options.subdir);
  const fileNameFor = options.fileName ?? ((item: T) => `${item.id}.json`);
  const subdirFor = options.subdir ?? (() => "");

  function pathFor(item: T): string {
    const path = resolve(root, subdirFor(item), fileNameFor(item));
    assertInsideData(path);
    return path;
  }

  /**
   * Reads and validates one file. A file that does not parse or does not match
   * the schema is quarantined and reported as absent, so one bad document never
   * takes down a list view.
   */
  async function readValidated(file: string): Promise<T | null> {
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      await quarantineFile(file, `Not valid JSON: ${(err as Error).message}`);
      return null;
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      await quarantineFile(file, `Does not match schema: ${issues}`);
      return null;
    }
    return result.data;
  }

  async function files(): Promise<string[]> {
    return listJsonFiles(root, recursive);
  }

  /**
   * Filenames can carry a prefix (`topic-<id>`) or a date (`2026-08-09-<id>`),
   * so an id maps to a file by suffix. The direct hit is tried first and the
   * scan is the fallback; both are cheap at personal-archive scale.
   */
  async function pathOf(id: string): Promise<string | null> {
    if (!id) return null;
    const direct = resolve(root, `${id}.json`);
    try {
      const s = await stat(direct);
      if (s.isFile()) return direct;
    } catch {
      /* fall through to the scan */
    }
    const all = await files();
    return all.find((f) => f.endsWith(`${id}.json`)) ?? null;
  }

  return {
    dir: root,
    files,
    pathOf,

    async get(id) {
      const file = await pathOf(id);
      if (!file) return null;
      return readValidated(file);
    },

    async list(filter) {
      const all = await files();
      const items: T[] = [];
      for (const file of all) {
        const item = await readValidated(file);
        if (!item) continue;
        if (filter && !matchesFilter(item, filter)) continue;
        items.push(item);
      }
      return items;
    },

    async put(item) {
      const validated = schema.parse(item);
      const target = pathFor(validated);
      // An id whose filename changed (a content item re-dated, say) would
      // otherwise leave a duplicate behind.
      const existing = await pathOf(validated.id);
      await mkdir(resolve(target, ".."), { recursive: true });
      await atomicWriteJson(target, validated);
      if (existing && existing !== target) {
        await rm(existing, { force: true });
      }
      return validated;
    },

    async patch(id, changes) {
      const current = await this.get(id);
      if (!current) throw new Error(`No item with id ${id} in ${root}`);
      // id is never patchable: it is the identity, not a field.
      const next = { ...current, ...changes, id: current.id };
      return this.put(next);
    },

    async remove(id) {
      const file = await pathOf(id);
      if (!file) return;
      assertInsideData(file);
      await rm(file, { force: true });
      log.debug(`removed ${file}`);
    },
  };
}
