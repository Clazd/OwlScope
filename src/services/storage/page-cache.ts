import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createLogger } from "@/lib/logging/log";
import { atomicWriteJson } from "./atomic-write";
import { CACHE_ROOT } from "./paths";

const log = createLogger("storage/page-cache");

/**
 * Fetched pages, cached by URL hash for 24 hours.
 *
 * It lives under `/data/.cache/` because it is derived: deleting the whole
 * directory costs one re-fetch and nothing else. It lives in `services/storage`
 * because that is the only place in the app allowed to touch `fs`.
 */

export const PAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const PAGES_ROOT = resolve(CACHE_ROOT, "pages");

export interface CachedPage {
  url: string;
  title: string;
  text: string;
  publishedAt: string | null;
  fetchedAt: string;
}

/** Hash rather than a slug: URLs contain characters filenames should not. */
function keyFor(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

function fileFor(url: string): string {
  return join(PAGES_ROOT, `${keyFor(url)}.json`);
}

export async function readCachedPage(url: string, now: number = Date.now()): Promise<CachedPage | null> {
  let raw: string;
  try {
    raw = await readFile(fileFor(url), "utf8");
  } catch {
    return null;
  }

  let page: CachedPage;
  try {
    page = JSON.parse(raw) as CachedPage;
  } catch {
    // A corrupt cache entry is not an incident. Drop it and re-fetch.
    await rm(fileFor(url), { force: true });
    return null;
  }

  const age = now - new Date(page.fetchedAt).getTime();
  if (!Number.isFinite(age) || age > PAGE_CACHE_TTL_MS) return null;
  // A hash collision would serve the wrong page, which is worse than a miss.
  if (page.url !== url) return null;
  return page;
}

export async function writeCachedPage(page: CachedPage): Promise<void> {
  await mkdir(PAGES_ROOT, { recursive: true });
  await atomicWriteJson(fileFor(page.url), page);
}

/** Drops expired entries. Called on boot alongside the derived index rebuild. */
export async function pruneCachedPages(now: number = Date.now()): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(PAGES_ROOT);
  } catch {
    return 0;
  }
  let dropped = 0;
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const path = join(PAGES_ROOT, entry);
    try {
      const info = await stat(path);
      if (now - info.mtimeMs <= PAGE_CACHE_TTL_MS) continue;
      await rm(path, { force: true });
      dropped += 1;
    } catch {
      /* raced with another prune; nothing to do */
    }
  }
  if (dropped > 0) log.debug(`pruned ${dropped} expired page(s)`);
  return dropped;
}
