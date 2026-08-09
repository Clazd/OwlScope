import { describe, expect, it } from "vitest";
import type { SearchResult } from "@/services/search/provider";
import { canonicalUrl, deduplicateResults, normalisedTitle } from "./dedupe";

function source(providerId: string, title: string, url: string): SearchResult {
  return { providerId, title, url, domain: new URL(url).hostname, snippet: providerId, publishedAt: null, retrievedAt: "2026-08-09T00:00:00.000Z" };
}

describe("Radar deduplication", () => {
  it("merges the same story from three providers and preserves every source", () => {
    const result = deduplicateResults([
      source("feeds:hacker-news", "Agent memory is durable state", "https://example.com/story?utm_source=hn"),
      source("feeds:reddit", "Agent memory is durable state", "https://reddit.com/r/ai/example"),
      source("feeds:rss", "Agent memory is durable state", "https://blog.example.org/agent-memory"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.sources).toHaveLength(3);
  });

  it("removes tracking parameters and normalises editorial title prefixes", () => {
    expect(canonicalUrl("https://www.example.com/a/?utm_campaign=x#part")).toBe("https://example.com/a");
    expect(normalisedTitle("Breaking: Agent Memory - Analysis")).toBe("agent memory");
  });
});
