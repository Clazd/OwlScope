import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { atomicWriteJson } from "./atomic-write";
import { assertInsideData, CACHE_ROOT } from "./paths";

const EntrySchema = z.object({
  id: z.string(),
  url: z.string(),
  fetchedAt: z.string(),
  body: z.string(),
  contentType: z.string().nullable(),
});

const FEED_CACHE = resolve(CACHE_ROOT, "feeds");

function pathFor(url: string): string {
  const id = createHash("sha256").update(url).digest("hex").slice(0, 24);
  const path = resolve(FEED_CACHE, `${id}.json`);
  assertInsideData(path);
  return path;
}

export interface FeedCacheHit {
  body: string;
  contentType: string | null;
  fetchedAt: string;
}

export async function readFeedCache(url: string, ttlMs: number): Promise<FeedCacheHit | null> {
  try {
    const parsed = EntrySchema.safeParse(JSON.parse(await readFile(pathFor(url), "utf8")));
    if (!parsed.success || parsed.data.url !== url) return null;
    if (Date.now() - new Date(parsed.data.fetchedAt).getTime() >= ttlMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function writeFeedCache(url: string, body: string, contentType: string | null): Promise<void> {
  const target = pathFor(url);
  await mkdir(FEED_CACHE, { recursive: true });
  await atomicWriteJson(target, {
    id: target.split(/[\\/]/).at(-1)?.replace(/\.json$/, "") ?? "feed",
    url,
    fetchedAt: new Date().toISOString(),
    body,
    contentType,
  });
}
