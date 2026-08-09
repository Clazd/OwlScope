import { afterEach, describe, expect, it, vi } from "vitest";

const { safeFetch } = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/net/safe-fetch", () => ({ safeFetch }));
vi.mock("@/services/storage/feed-cache", () => ({
  readFeedCache: vi.fn().mockResolvedValue(null),
  writeFeedCache: vi.fn().mockResolvedValue(undefined),
}));

import {
  createDevCommunityProvider,
  createGitHubProvider,
  createLobstersProvider,
  createOpenAlexProvider,
  createRedditProvider,
} from "./feeds";

function reply(body: unknown, status = 200) {
  return Promise.resolve({ url: "https://example.com", status, contentType: "application/json", body: typeof body === "string" ? body : JSON.stringify(body), truncated: false });
}

afterEach(() => {
  safeFetch.mockReset();
  delete process.env.GITHUB_TOKEN;
  delete process.env.REDDIT_CLIENT_ID;
  delete process.env.REDDIT_CLIENT_SECRET;
  delete process.env.REDDIT_USER_AGENT;
});

describe("Radar feed providers", () => {
  it("uses an optional GitHub token and searches configured qualifiers separately", async () => {
    process.env.GITHUB_TOKEN = "github-test-token";
    safeFetch.mockImplementation(() => reply({ items: [{ full_name: "owner/repo", html_url: "https://github.com/owner/repo", description: "Agent tools", created_at: "2026-08-01", stargazers_count: 42 }] }));
    const provider = createGitHubProvider({ languages: ["TypeScript"], topics: ["ai-agents"], windowDays: 14 });
    const results = await provider.search("AI agents", { limit: 5 });
    expect(results).toHaveLength(1);
    expect(safeFetch).toHaveBeenCalledTimes(2);
    expect(safeFetch.mock.calls[0]?.[1]?.headers.authorization).toBe("Bearer github-test-token");
  });

  it("uses Reddit OAuth when credentials exist", async () => {
    process.env.REDDIT_CLIENT_ID = "client";
    process.env.REDDIT_CLIENT_SECRET = "secret";
    process.env.REDDIT_USER_AGENT = "PersonaStudio test";
    safeFetch.mockImplementation((url: string) => url.includes("access_token")
      ? reply({ access_token: "reddit-test-token", expires_in: 3600 })
      : reply({ data: { children: [{ data: { title: "Programming agents", selftext: "A useful discussion", url: "https://example.com/agents", permalink: "/r/programming/x", created_utc: 1780000000, score: 20 } }] } }));
    const results = await createRedditProvider({ subreddits: ["programming"] }).search("programming agents");
    expect(results).toHaveLength(1);
    expect(safeFetch.mock.calls[1]?.[0]).toContain("oauth.reddit.com");
    expect(safeFetch.mock.calls[1]?.[1]?.headers.authorization).toBe("Bearer reddit-test-token");
  });

  it("parses DEV Community and Lobsters without credentials", async () => {
    safeFetch.mockImplementation((url: string) => url.includes("dev.to")
      ? reply([{ title: "Reliable agents", url: "https://dev.to/a/reliable-agents", description: "Tool validation", published_at: "2026-08-08", public_reactions_count: 10, user: { username: "a" } }])
      : reply("<rss><channel><item><title>Agent reliability</title><link>https://lobste.rs/s/abc</link><description>Recovery patterns</description><pubDate>Sat, 08 Aug 2026 12:00:00 GMT</pubDate></item></channel></rss>"));
    const dev = await createDevCommunityProvider({ tags: ["ai"] }).search("reliable agents");
    const lobsters = await createLobstersProvider({ tags: ["ai"] }).search("agents");
    expect(dev[0]?.providerId).toBe("feeds:dev-community");
    expect(lobsters[0]?.providerId).toBe("feeds:lobsters");
  });

  it("reconstructs OpenAlex abstracts and keeps the DOI as provenance", async () => {
    safeFetch.mockImplementation(() => reply({ results: [{
      id: "https://openalex.org/W1", display_name: "Reliable agents", doi: "https://doi.org/10.1/example",
      publication_date: "2026-08-08", abstract_inverted_index: { Reliable: [0], agents: [1] },
      primary_location: { landing_page_url: "https://example.edu/paper" },
    }] }));
    const results = await createOpenAlexProvider({ windowDays: 90 }).search("reliable agents");
    expect(results[0]).toMatchObject({ url: "https://doi.org/10.1/example", snippet: "Reliable agents", providerId: "feeds:openalex" });
  });
});
