import "server-only";
import { createLogger } from "@/lib/logging/log";
import { safeFetch } from "@/lib/net/safe-fetch";
import { readCachedPage, writeCachedPage } from "@/services/storage/page-cache";
import {
  domainOf,
  excerptOf,
  extractPublishedAt,
  extractReadableText,
  extractTitle,
} from "./extract";
import type { SearchOptions, SearchProvider, SearchResult } from "./provider";

const log = createLogger("search/manual-url");

export const PROVIDER_ID = "manual-url";

/**
 * The user pastes a link; the server fetches it and stores what it says.
 *
 * Every fetch goes through the SSRF guard from slice 1 - private and loopback
 * ranges blocked on every redirect hop, three redirects, 2MB, ten seconds - and
 * every fetched page is cached for 24 hours so re-running a topic does not
 * re-hammer somebody's server.
 *
 * This provider is the answer to "the model cannot search". It is slower and
 * more deliberate than a search, and it is never wrong about where the text
 * came from.
 */

/** A page whose body is not text has nothing for the researcher to read. */
function isReadable(contentType: string | null): boolean {
  if (!contentType) return true;
  return /^(text\/|application\/(xhtml\+xml|xml|json))/i.test(contentType.trim());
}

export interface FetchedPage extends SearchResult {
  /** The whole extracted body, for the researcher. The snippet is the excerpt. */
  text: string;
  fromCache: boolean;
}

export async function fetchPage(url: string): Promise<FetchedPage> {
  const cached = await readCachedPage(url);
  if (cached) {
    log.debug(`cache hit for ${domainOf(url)}`);
    return toResult(cached.url, cached.title, cached.text, cached.publishedAt, cached.fetchedAt, true);
  }

  const response = await safeFetch(url);
  if (response.status >= 400) {
    throw new Error(`${domainOf(url) || url} returned ${response.status}.`);
  }
  if (!isReadable(response.contentType)) {
    throw new Error(`${domainOf(url) || url} returned ${response.contentType}, which has no readable text.`);
  }

  const html = response.body;
  const text = extractReadableText(html);
  if (text.length < 40) {
    throw new Error(
      `Nothing readable at ${domainOf(url) || url}. It may render its content with JavaScript; paste the text instead.`,
    );
  }

  const page = {
    // The post-redirect URL, because that is the page the text is actually from.
    url: response.url,
    title: extractTitle(html) || domainOf(response.url),
    text,
    publishedAt: extractPublishedAt(html),
    fetchedAt: new Date().toISOString(),
  };
  await writeCachedPage(page);
  if (response.truncated) log.warn(`body from ${page.url} was truncated at the 2MB cap`);

  return toResult(page.url, page.title, page.text, page.publishedAt, page.fetchedAt, false);
}

function toResult(
  url: string,
  title: string,
  text: string,
  publishedAt: string | null,
  retrievedAt: string,
  fromCache: boolean,
): FetchedPage {
  return {
    url,
    title,
    domain: domainOf(url),
    snippet: excerptOf(text),
    publishedAt,
    retrievedAt,
    providerId: PROVIDER_ID,
    text,
    fromCache,
  };
}

/**
 * As a `SearchProvider`, the query is a whitespace-separated list of URLs. It
 * never invents a query of its own - this provider only ever fetches what it
 * was handed.
 */
export function createManualUrlProvider(): SearchProvider {
  return {
    id: PROVIDER_ID,
    unavailableReason: () => null,

    async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
      const urls = query.split(/\s+/).filter((part) => /^https?:\/\//i.test(part));
      const results: SearchResult[] = [];
      for (const url of urls.slice(0, opts.limit ?? 5)) {
        try {
          results.push(await fetchPage(url));
        } catch (err) {
          // One bad link does not fail the batch; the user sees which one.
          log.warn(`could not fetch ${url}: ${(err as Error).message}`);
        }
      }
      return results;
    },
  };
}
