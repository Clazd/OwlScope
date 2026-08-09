import "server-only";
import { z } from "zod";
import { FixtureNotFoundError, fixtureLabel, readFixture } from "@/services/storage/fixtures";
import { domainOf } from "./extract";
import type { SearchOptions, SearchProvider, SearchResult } from "./provider";

export const PROVIDER_ID = "fixture";

/**
 * Canned results from `/fixtures/search/*.json`.
 *
 * This is what makes "the whole flow runs with zero network calls" true rather
 * than aspirational, and it is how the awkward cases get built at all: no
 * results, one thin forum link, a source published six hours ago. None of those
 * can be produced on demand from a real search.
 */

const FixtureFileSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      publishedAt: z.string().nullable().optional(),
    }),
  ),
});

export function createFixtureSearchProvider(): SearchProvider {
  return {
    id: PROVIDER_ID,
    unavailableReason: () => null,

    async search(_query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
      const kase = opts.fixtureCase ?? "default";
      let raw: string;
      try {
        raw = await readFixture("search", kase);
      } catch (err) {
        if (err instanceof FixtureNotFoundError) {
          throw new Error(`No search fixture. Add ${fixtureLabel("search", kase)}.`);
        }
        throw err;
      }

      const parsed = FixtureFileSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        // A bad fixture is an authoring mistake, not a model failure.
        throw new Error(`${fixtureLabel("search", kase)} does not match the search fixture shape.`);
      }

      const retrievedAt = new Date().toISOString();
      return parsed.data.results.slice(0, opts.limit ?? 6).map((entry) => ({
        title: entry.title,
        url: entry.url,
        domain: domainOf(entry.url),
        snippet: entry.snippet,
        publishedAt: entry.publishedAt ?? null,
        retrievedAt,
        providerId: PROVIDER_ID,
      }));
    },
  };
}
