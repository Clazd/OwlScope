/**
 * The search boundary.
 *
 * Three implementations ship in slice 3 and the rest arrive later; the point of
 * the interface is that adding one never touches a caller. Note what is absent:
 * no provider returns a claim, an angle, or a sentence. A provider returns
 * URLs and the text at them. Everything a model concludes from that happens in
 * a stage that can be inspected separately.
 */

export interface SearchResult {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  publishedAt: string | null;
  retrievedAt: string;
  providerId: string;
}

export interface SearchOptions {
  /** Upper bound on results. Providers may return fewer, never more. */
  limit?: number;
  /** Fixture case, for the sandbox provider and the tests. */
  fixtureCase?: string;
}

export interface SearchProvider {
  readonly id: string;
  /**
   * Why this provider cannot run right now, or null when it can. Research
   * reports these rather than silently returning nothing — "no evidence" and
   * "nothing was asked" are different outcomes and must not look alike.
   */
  unavailableReason(): string | null;
  search(query: string, opts?: SearchOptions): Promise<SearchResult[]>;
}

/** Providers a run may use, in the order research should try them. */
export type ProviderId =
  | "native-model-search"
  | "manual-url"
  | "fixture"
  | "feeds:hacker-news"
  | "feeds:reddit"
  | "feeds:arxiv"
  | "feeds:github"
  | "feeds:dev-community"
  | "feeds:lobsters"
  | "feeds:openalex"
  | "feeds:rss";

export function emptyResult(providerId: string, url: string): SearchResult {
  return {
    title: url,
    url,
    domain: "",
    snippet: "",
    publishedAt: null,
    retrievedAt: new Date().toISOString(),
    providerId,
  };
}
