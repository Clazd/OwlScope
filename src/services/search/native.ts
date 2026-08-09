import "server-only";
import { z } from "zod";
import { createLogger } from "@/lib/logging/log";
import { extractJson } from "@/lib/validation/json";
import type { AIProvider } from "@/services/ai/types";
import { domainOf } from "./extract";
import type { SearchOptions, SearchProvider, SearchResult } from "./provider";

const log = createLogger("search/native");

export const PROVIDER_ID = "native-model-search";

/**
 * Search through the AI provider's own web search tool.
 *
 * Billed through the existing key, so there is no second secret and no search
 * vendor. The interesting part is not the call — it is what happens to the
 * result.
 *
 * The tool returns URLs. The model returns snippets. Those are two different
 * kinds of thing and they are kept apart: the URL set is fact, the snippets are
 * claims about it, and a snippet whose URL is not in the set is dropped. That
 * is rule 8 made mechanical rather than asked for politely.
 */

const SnippetSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      snippet: z.string(),
      publishedAt: z.string().nullable(),
    }),
  ),
});

/** URLs the model produced that no search returned. Surfaced, never silent. */
export interface NativeSearchOutcome {
  results: SearchResult[];
  droppedUrls: string[];
  searchCount: number;
  tokensIn: number;
  tokensOut: number;
  costEstimate: number;
  latencyMs: number;
  model: string;
  prompt: string;
  rawResponse: string;
}

function buildPrompt(query: string, limit: number): string {
  return [
    `Search the web for: ${query}`,
    "",
    "Then summarise what you actually retrieved.",
    "",
    "Rules:",
    "  - Only list pages the search tool returned. Do not add a URL from memory.",
    "  - Copy each URL exactly as the search returned it.",
    "  - The snippet must be a factual summary of that page, 1-3 sentences, in the page's own terms.",
    "  - publishedAt is an ISO 8601 date, or null if the page does not state one. Never guess a date.",
    `  - At most ${limit} results, best first.`,
    "",
    'Reply with JSON: {"results":[{"url":"…","title":"…","snippet":"…","publishedAt":"…"|null}]}',
    "No prose, no code fence.",
  ].join("\n");
}

/** Normalised for comparison: a trailing slash is not a different page. */
function urlKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const path = parsed.pathname.replace(/\/$/, "");
    return `${parsed.hostname.replace(/^www\./, "").toLowerCase()}${path}${parsed.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function createNativeSearchProvider(provider: AIProvider): SearchProvider & {
  searchDetailed(query: string, opts?: SearchOptions): Promise<NativeSearchOutcome>;
} {
  function unavailableReason(): string | null {
    if (!provider.searchCapability().supported || !provider.webSearch) {
      return `${provider.name} cannot run web search. Paste a URL instead, or switch provider.`;
    }
    return null;
  }

  async function searchDetailed(query: string, opts: SearchOptions = {}): Promise<NativeSearchOutcome> {
    const reason = unavailableReason();
    if (reason) throw new Error(reason);

    const limit = opts.limit ?? 6;
    const prompt = buildPrompt(query, limit);
    const response = await provider.webSearch!({
      stage: "research-search",
      tier: "strong",
      prompt,
      maxSearches: 4,
      maxTokens: 2000,
      fixtureCase: opts.fixtureCase,
    });

    if (response.toolError) {
      log.warn(`search tool reported ${response.toolError}`);
    }

    // The allowlist. Everything below is checked against it.
    const allowed = new Map(response.hits.map((hit) => [urlKey(hit.url), hit]));

    let parsed: z.infer<typeof SnippetSchema> = { results: [] };
    if (response.text.trim()) {
      const attempt = SnippetSchema.safeParse(safeJson(response.text));
      if (attempt.success) parsed = attempt.data;
      else log.warn(`search summary did not validate: ${attempt.error.issues[0]?.message}`);
    }

    const retrievedAt = new Date().toISOString();
    const results: SearchResult[] = [];
    const droppedUrls: string[] = [];
    const used = new Set<string>();

    for (const entry of parsed.results) {
      const key = urlKey(entry.url);
      const hit = allowed.get(key);
      if (!hit) {
        // A URL the model produced that no search returned. It is invented
        // until proven otherwise, so it does not become a source.
        droppedUrls.push(entry.url);
        log.warn(`dropped model-produced URL not returned by any search: ${entry.url}`);
        continue;
      }
      if (used.has(key)) continue;
      used.add(key);
      results.push({
        // The provider's URL wins over the model's transcription of it.
        url: hit.url,
        title: entry.title.trim() || hit.title,
        domain: domainOf(hit.url),
        snippet: entry.snippet.trim(),
        publishedAt: isoOrNull(entry.publishedAt),
        retrievedAt,
        providerId: PROVIDER_ID,
      });
    }

    // A page the search returned but the model did not write up is still a real
    // page. Keep it, with no snippet, rather than pretending it was not found.
    for (const [key, hit] of allowed) {
      if (used.has(key)) continue;
      results.push({
        url: hit.url,
        title: hit.title,
        domain: domainOf(hit.url),
        snippet: "",
        publishedAt: null,
        retrievedAt,
        providerId: PROVIDER_ID,
      });
    }

    return {
      results: results.slice(0, limit),
      droppedUrls,
      searchCount: response.searchCount,
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut,
      costEstimate: response.costEstimate,
      latencyMs: response.latencyMs,
      model: response.model,
      prompt,
      rawResponse: response.text,
    };
  }

  return {
    id: PROVIDER_ID,
    unavailableReason,
    async search(query, opts) {
      return (await searchDetailed(query, opts)).results;
    },
    searchDetailed,
  };
}

function safeJson(text: string): unknown {
  try {
    return extractJson(text);
  } catch {
    return null;
  }
}

/** Only a date the model can actually justify. A bad date is worse than none. */
function isoOrNull(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
