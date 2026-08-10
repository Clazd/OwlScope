import "server-only";
import type { SourceImage } from "@/domain/studio/schema";
import { createLogger } from "@/lib/logging/log";
import { safeFetch } from "@/lib/net/safe-fetch";
import { readCachedPage, writeCachedPage } from "@/services/storage/page-cache";
import { domainOf, extractPublishedAt, extractReadableText, extractSocialImage, extractTitle } from "./extract";

const log = createLogger("search/images");

/**
 * Finding the picture a source page offers for sharing.
 *
 * This is deliberately separate from `fetchPage`. That function exists to get
 * text a researcher can quote and refuses a page with none; a page can have
 * nothing readable and still carry a perfectly good chart in its social card.
 * Harvesting through the researcher's front door would drop exactly those.
 *
 * Everything else it shares: the same SSRF guard, the same 24-hour page cache,
 * so a source already read during research costs no second request.
 */

/** Concurrent page fetches. Six sources, six polite requests, not a stampede. */
const CONCURRENCY = 4;

export async function harvestSocialImage(url: string): Promise<SourceImage | null> {
  const cached = await readCachedPage(url);
  // `undefined` means cached before images were read - a miss, not an absence.
  if (cached && cached.image !== undefined) {
    log.debug(`cache hit for ${domainOf(url)}`);
    return cached.image;
  }

  const response = await safeFetch(url);
  if (response.status >= 400) {
    throw new Error(`${domainOf(url) || url} returned ${response.status}.`);
  }

  const html = response.body;
  const image = extractSocialImage(html, response.url);

  // Write the whole page back, not just the image, so a later research pass on
  // the same URL is still a cache hit rather than a re-fetch.
  const text = extractReadableText(html);
  await writeCachedPage({
    url: response.url,
    title: extractTitle(html) || domainOf(response.url),
    text,
    publishedAt: extractPublishedAt(html),
    fetchedAt: new Date().toISOString(),
    image,
  });
  // The cache is keyed by URL, so a redirected page needs the original key too
  // or the next lookup misses and re-fetches every time.
  if (response.url !== url) {
    await writeCachedPage({
      url,
      title: extractTitle(html) || domainOf(url),
      text,
      publishedAt: extractPublishedAt(html),
      fetchedAt: new Date().toISOString(),
      image,
    });
  }

  log.debug(image ? `found an image on ${domainOf(url)}` : `no shareable image on ${domainOf(url)}`);
  return image;
}

export interface HarvestOutcome<T> {
  item: T;
  image: SourceImage | null;
  /** Why this one produced nothing, when the failure was a failure. */
  error: string | null;
}

/**
 * Harvests a batch, bounded and forgiving. One dead host must not cost the
 * other five their images, so every failure is captured per item and reported
 * rather than thrown.
 */
export async function harvestBatch<T>(items: T[], urlOf: (item: T) => string): Promise<HarvestOutcome<T>[]> {
  const outcomes: HarvestOutcome<T>[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) return;
      try {
        outcomes[index] = { item, image: await harvestSocialImage(urlOf(item)), error: null };
      } catch (err) {
        const message = (err as Error).message;
        log.warn(`could not read ${urlOf(item)}: ${message}`);
        outcomes[index] = { item, image: null, error: message };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return outcomes;
}
