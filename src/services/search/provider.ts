/**
 * Search provider — stub in slice 1.
 *
 * Research lands in slice 3. The interface is here so that when it does, no
 * caller has to be rewritten. There is deliberately no implementation: adding
 * a paid search API is explicitly out of scope, and the eventual answer is
 * either the model's own search capability or hand-fetched URLs through
 * `lib/net/safe-fetch`.
 */

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  publishedAt: string | null;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, limit?: number): Promise<SearchHit[]>;
}

export function createSearchProvider(): SearchProvider {
  return {
    name: "unavailable",
    async search() {
      throw new Error("Search is not implemented until slice 3.");
    },
  };
}
