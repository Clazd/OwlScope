import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createLogger } from "@/lib/logging/log";
import { CACHE_ROOT } from "./paths";

const log = createLogger("storage/image-cache");

/**
 * Downloaded source images, cached by URL hash.
 *
 * Under `/data/.cache/` for the same reason the page cache is: these bytes are
 * somebody else's, held only so the browser never has to talk to a publisher
 * directly. Deleting the directory costs a re-download and nothing else.
 */

export const IMAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 8MB. Generous for a social card, mean enough to stop a surprise. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const IMAGES_ROOT = resolve(CACHE_ROOT, "images");

/**
 * What may be served back. An allowlist rather than a blocklist, because the
 * failure mode of getting this wrong is proxying `text/html` from an arbitrary
 * host through our own origin.
 */
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export function isAllowedImageType(contentType: string | null): boolean {
  return normaliseType(contentType) !== null;
}

export function normaliseType(contentType: string | null): string | null {
  const bare = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return bare in ALLOWED_TYPES ? bare : null;
}

export function extensionFor(contentType: string): string {
  return ALLOWED_TYPES[contentType] ?? "bin";
}

export interface CachedImage {
  bytes: Buffer;
  contentType: string;
}

function keyFor(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

export async function readCachedImage(url: string, now: number = Date.now()): Promise<CachedImage | null> {
  const key = keyFor(url);
  let entries: string[];
  try {
    entries = await readdir(IMAGES_ROOT);
  } catch {
    return null;
  }
  // The extension carries the content type, so the filename is the metadata and
  // there is no sidecar to keep in sync.
  const match = entries.find((entry) => entry.startsWith(`${key}.`));
  if (!match) return null;

  const path = join(IMAGES_ROOT, match);
  try {
    const info = await stat(path);
    if (now - info.mtimeMs > IMAGE_CACHE_TTL_MS) return null;
    const extension = match.slice(key.length + 1);
    const contentType = Object.keys(ALLOWED_TYPES).find((type) => ALLOWED_TYPES[type] === extension);
    if (!contentType) return null;
    return { bytes: await readFile(path), contentType };
  } catch {
    return null;
  }
}

export async function writeCachedImage(url: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const type = normaliseType(contentType);
  if (!type) throw new Error(`Refusing to cache ${contentType} as an image.`);
  await mkdir(IMAGES_ROOT, { recursive: true });
  await writeFile(join(IMAGES_ROOT, `${keyFor(url)}.${extensionFor(type)}`), bytes);
}

/** Drops expired entries, alongside the page-cache prune. */
export async function pruneCachedImages(now: number = Date.now()): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(IMAGES_ROOT);
  } catch {
    return 0;
  }
  let dropped = 0;
  for (const entry of entries) {
    const path = join(IMAGES_ROOT, entry);
    try {
      const info = await stat(path);
      if (now - info.mtimeMs <= IMAGE_CACHE_TTL_MS) continue;
      await rm(path, { force: true });
      dropped += 1;
    } catch {
      /* raced with another prune; nothing to do */
    }
  }
  if (dropped > 0) log.debug(`pruned ${dropped} expired image(s)`);
  return dropped;
}
