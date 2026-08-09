import "server-only";
import { z } from "zod";
import type { RadarSettings } from "@/domain/settings/schema";
import { safeFetch } from "@/lib/net/safe-fetch";
import { createLogger } from "@/lib/logging/log";
import { FixtureNotFoundError, readFixture } from "@/services/storage/fixtures";
import { readFeedCache, writeFeedCache } from "@/services/storage/feed-cache";
import { domainOf, excerptOf } from "./extract";
import type { SearchOptions, SearchProvider, SearchResult } from "./provider";

const log = createLogger("search/feeds");
export const FEED_CACHE_TTL_MS = 30 * 60 * 1000;
const USER_AGENT = "GroundedVoice-Radar/0.1 (private local research tool; contact: localhost)";
const degraded = new Map<string, string>();

export const FEED_PROVIDER_IDS = [
  "feeds:hacker-news",
  "feeds:reddit",
  "feeds:arxiv",
  "feeds:github",
  "feeds:dev-community",
  "feeds:lobsters",
  "feeds:openalex",
  "feeds:rss",
] as const;
export type FeedProviderId = (typeof FEED_PROVIDER_IDS)[number];

class FeedHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "FeedHttpError";
  }
}

async function fetchCached(url: string, accept: string, headers?: Record<string, string>): Promise<{ body: string; fromCache: boolean }> {
  const cached = await readFeedCache(url, FEED_CACHE_TTL_MS);
  if (cached) return { body: cached.body, fromCache: true };
  const response = await safeFetch(url, { accept, userAgent: USER_AGENT, headers });
  if (response.status === 429) throw new FeedHttpError(429, "Rate limited. Paused for this server session.");
  if (response.status >= 400) throw new FeedHttpError(response.status, `Endpoint returned ${response.status}.`);
  await writeFeedCache(url, response.body, response.contentType);
  return { body: response.body, fromCache: false };
}

function queryWords(query: string): string[] {
  return [...new Set(query.toLowerCase().replace(/\bor\b/g, " ").match(/[\p{L}\p{N}+#.-]{3,}/gu) ?? [])];
}

function plainQuery(query: string): string {
  return queryWords(query).slice(0, 12).join(" ");
}

let redditToken: { value: string; expiresAt: number } | null = null;

async function redditAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.REDDIT_CLIENT_SECRET?.trim() ?? "";
  if (!clientId && !clientSecret) return null;
  if (!clientId || !clientSecret) throw new Error("Reddit credentials are incomplete. Set both REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.");
  if (redditToken && redditToken.expiresAt > Date.now() + 30_000) return redditToken.value;

  const userAgent = process.env.REDDIT_USER_AGENT?.trim() || USER_AGENT;
  const response = await safeFetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    userAgent,
    accept: "application/json",
    headers: {
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (response.status >= 400) throw new FeedHttpError(response.status, `Reddit OAuth returned ${response.status}.`);
  const parsed = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).parse(JSON.parse(response.body));
  redditToken = { value: parsed.access_token, expiresAt: Date.now() + parsed.expires_in * 1000 };
  return redditToken.value;
}

function available(id: FeedProviderId): string | null {
  return degraded.get(id) ?? null;
}

async function guarded<T>(id: FeedProviderId, action: () => Promise<T>): Promise<T> {
  const reason = degraded.get(id);
  if (reason) throw new Error(reason);
  try {
    return await action();
  } catch (error) {
    if (error instanceof FeedHttpError && error.status === 429) degraded.set(id, error.message);
    throw error;
  }
}

function iso(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function result(id: FeedProviderId, entry: Omit<SearchResult, "providerId" | "retrievedAt" | "domain">): SearchResult {
  return { ...entry, domain: domainOf(entry.url), providerId: id, retrievedAt: new Date().toISOString() };
}

function unique(results: SearchResult[], limit: number): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((item) => {
    const key = item.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export function createHackerNewsProvider(config: RadarSettings["hackerNews"]): SearchProvider {
  const id: FeedProviderId = "feeds:hacker-news";
  return {
    id,
    unavailableReason: () => available(id),
    async search(query, opts = {}) {
      return guarded(id, async () => {
        const limit = opts.limit ?? 12;
        const terms = [...new Set([query, ...config.keywords].map((v) => v.trim()).filter(Boolean))].slice(0, 4);
        const out: SearchResult[] = [];
        for (const term of terms) {
          const url = `https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E%3D${config.minPoints}&hitsPerPage=${limit}&query=${encodeURIComponent(term)}`;
          const { body } = await fetchCached(url, "application/json");
          const parsed = z.object({ hits: z.array(z.object({
            title: z.string().nullable().optional(), story_title: z.string().nullable().optional(),
            url: z.string().nullable().optional(), story_url: z.string().nullable().optional(),
            objectID: z.string(), created_at: z.string().nullable().optional(), points: z.number().nullable().optional(),
          })) }).parse(JSON.parse(body));
          for (const hit of parsed.hits) {
            const target = hit.url || hit.story_url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
            const title = hit.title || hit.story_title || target;
            out.push(result(id, { title, url: target, snippet: `${hit.points ?? 0} points on Hacker News.`, publishedAt: iso(hit.created_at) }));
          }
        }
        return unique(out, limit);
      });
    },
  };
}

export function createRedditProvider(config: RadarSettings["reddit"]): SearchProvider {
  const id: FeedProviderId = "feeds:reddit";
  return {
    id,
    unavailableReason: () => available(id),
    async search(query, opts = {}) {
      return guarded(id, async () => {
        const limit = opts.limit ?? 12;
        const terms = queryWords(query);
        const token = await redditAccessToken();
        const userAgent = process.env.REDDIT_USER_AGENT?.trim() || USER_AGENT;
        const out: SearchResult[] = [];
        for (const subreddit of config.subreddits.slice(0, 8)) {
          const clean = subreddit.replace(/^r\//, "").replace(/[^a-z0-9_]/gi, "");
          if (!clean) continue;
          const url = `${token ? "https://oauth.reddit.com" : "https://www.reddit.com"}/r/${clean}/hot.json?limit=25&raw_json=1`;
          const { body } = await fetchCached(url, "application/json", token ? { authorization: `Bearer ${token}`, "user-agent": userAgent } : undefined);
          const json = z.object({ data: z.object({ children: z.array(z.object({ data: z.object({
            title: z.string(), selftext: z.string().optional(), url: z.string(), permalink: z.string(),
            created_utc: z.number(), score: z.number().optional(),
          }) })) }) }).parse(JSON.parse(body));
          for (const child of json.data.children) {
            const item = child.data;
            const haystack = `${item.title} ${item.selftext ?? ""}`.toLowerCase();
            if (terms.length > 0 && !terms.some((term) => haystack.includes(term))) continue;
            out.push(result(id, {
              title: item.title,
              url: item.url || `https://www.reddit.com${item.permalink}`,
              snippet: excerptOf(item.selftext || `${item.score ?? 0} points in r/${clean}`),
              publishedAt: iso(item.created_utc * 1000),
            }));
          }
        }
        return unique(out, limit);
      });
    },
  };
}

export function createArxivProvider(config: RadarSettings["arxiv"]): SearchProvider {
  const id: FeedProviderId = "feeds:arxiv";
  return {
    id,
    unavailableReason: () => available(id),
    async search(query, opts = {}) {
      return guarded(id, async () => {
        const limit = opts.limit ?? 12;
        const category = config.categories.map((value) => `cat:${value}`).join(" OR ");
        const terms = query.trim() ? ` AND all:${JSON.stringify(query)}` : "";
        const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(`(${category})${terms}`)}&start=0&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`;
        const { body } = await fetchCached(url, "application/atom+xml,application/xml;q=0.9");
        return parseAtom(body, id).slice(0, limit);
      });
    },
  };
}

export function createGitHubProvider(config: RadarSettings["github"]): SearchProvider {
  const id: FeedProviderId = "feeds:github";
  return {
    id,
    unavailableReason: () => available(id),
    async search(query, opts = {}) {
      return guarded(id, async () => {
        const limit = opts.limit ?? 12;
        const since = new Date(Date.now() - config.windowDays * 86400000).toISOString().slice(0, 10);
        const token = process.env.GITHUB_TOKEN?.trim();
        const variants = [
          ...config.languages.map((language) => `language:${JSON.stringify(language)}`),
          ...config.topics.map((topic) => `topic:${topic}`),
        ].filter(Boolean).slice(0, 4);
        if (variants.length === 0) variants.push("");
        const out: SearchResult[] = [];
        for (const qualifier of variants) {
          const q = `${query} created:>=${since} ${qualifier}`.trim();
          const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${Math.min(30, limit)}`;
          const { body } = await fetchCached(url, "application/vnd.github+json", {
            "x-github-api-version": "2022-11-28",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          });
          const parsed = z.object({ items: z.array(z.object({
            full_name: z.string(), html_url: z.string(), description: z.string().nullable(),
            created_at: z.string(), stargazers_count: z.number(),
          })) }).parse(JSON.parse(body));
          out.push(...parsed.items.map((item) => result(id, {
            title: item.full_name,
            url: item.html_url,
            snippet: `${item.description ?? "No description."} ${item.stargazers_count} stars.`,
            publishedAt: iso(item.created_at),
          })));
        }
        return unique(out, limit);
      });
    },
  };
}

export function createDevCommunityProvider(config: RadarSettings["devCommunity"]): SearchProvider {
  const id: FeedProviderId = "feeds:dev-community";
  return {
    id,
    unavailableReason: () => available(id),
    async search(query, opts = {}) {
      return guarded(id, async () => {
        const limit = opts.limit ?? 12;
        const terms = queryWords(query);
        const out: SearchResult[] = [];
        for (const configured of config.tags.slice(0, 8)) {
          const tagName = configured.toLowerCase().replace(/[^a-z0-9-]/g, "");
          if (!tagName) continue;
          const url = `https://dev.to/api/articles?tag=${encodeURIComponent(tagName)}&top=14&per_page=${Math.min(30, limit * 2)}`;
          const { body } = await fetchCached(url, "application/json");
          const parsed = z.array(z.object({
            title: z.string(), url: z.string(), description: z.string().nullable(), published_at: z.string().nullable(),
            public_reactions_count: z.number().optional(), user: z.object({ username: z.string() }),
          })).parse(JSON.parse(body));
          for (const item of parsed) {
            const haystack = `${item.title} ${item.description ?? ""} ${tagName}`.toLowerCase();
            if (terms.length > 0 && !terms.some((term) => haystack.includes(term))) continue;
            out.push(result(id, {
              title: item.title, url: item.url,
              snippet: excerptOf(`${item.description ?? "No description."} ${item.public_reactions_count ?? 0} reactions · @${item.user.username}`),
              publishedAt: iso(item.published_at),
            }));
          }
        }
        return unique(out, limit);
      });
    },
  };
}

export function createLobstersProvider(config: RadarSettings["lobsters"]): SearchProvider {
  const id: FeedProviderId = "feeds:lobsters";
  return {
    id,
    unavailableReason: () => available(id),
    async search(_query, opts = {}) {
      return guarded(id, async () => {
        const limit = opts.limit ?? 12;
        const tags = config.tags.map((value) => value.toLowerCase().replace(/[^a-z0-9_-]/g, "")).filter(Boolean).slice(0, 8);
        const urls = tags.length ? tags.map((tagName) => `https://lobste.rs/t/${tagName}.rss`) : ["https://lobste.rs/rss"];
        const out: SearchResult[] = [];
        for (const url of urls) {
          const { body } = await fetchCached(url, "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9");
          out.push(...parseAtom(body, id));
        }
        return unique(out, limit);
      });
    },
  };
}

function openAlexAbstract(index: Record<string, number[]> | null): string {
  if (!index) return "";
  return Object.entries(index)
    .flatMap(([word, positions]) => positions.map((position) => ({ word, position })))
    .sort((a, b) => a.position - b.position)
    .map((item) => item.word)
    .join(" ");
}

export function createOpenAlexProvider(config: RadarSettings["openAlex"]): SearchProvider {
  const id: FeedProviderId = "feeds:openalex";
  return {
    id,
    unavailableReason: () => available(id),
    async search(query, opts = {}) {
      return guarded(id, async () => {
        const limit = opts.limit ?? 12;
        const search = plainQuery(query);
        if (!search) return [];
        const since = new Date(Date.now() - config.windowDays * 86400000).toISOString().slice(0, 10);
        const url = `https://api.openalex.org/works?search=${encodeURIComponent(search)}&filter=from_publication_date:${since}&sort=publication_date:desc&per-page=${limit}`;
        const { body } = await fetchCached(url, "application/json");
        const parsed = z.object({ results: z.array(z.object({
          id: z.string(), display_name: z.string(), doi: z.string().nullable(), publication_date: z.string().nullable(),
          abstract_inverted_index: z.record(z.string(), z.array(z.number().int())).nullable(),
          primary_location: z.object({ landing_page_url: z.string().nullable() }).nullable(),
        })) }).parse(JSON.parse(body));
        return parsed.results.map((item) => result(id, {
          title: item.display_name,
          url: item.doi || item.primary_location?.landing_page_url || item.id,
          snippet: excerptOf(openAlexAbstract(item.abstract_inverted_index) || "Academic work indexed by OpenAlex."),
          publishedAt: iso(item.publication_date),
        })).slice(0, limit);
      });
    },
  };
}

export function createRssProvider(config: RadarSettings["rss"]): SearchProvider {
  const id: FeedProviderId = "feeds:rss";
  return {
    id,
    unavailableReason: () => available(id),
    async search(query, opts = {}) {
      return guarded(id, async () => {
        const limit = opts.limit ?? 12;
        const terms = query.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
        const out: SearchResult[] = [];
        for (const url of config.urls.slice(0, 20)) {
          const { body } = await fetchCached(url, "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9");
          for (const entry of parseAtom(body, id)) {
            const haystack = `${entry.title} ${entry.snippet}`.toLowerCase();
            if (terms.length === 0 || terms.some((term) => haystack.includes(term))) out.push(entry);
          }
        }
        return unique(out, limit);
      });
    },
  };
}

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function tag(xml: string, names: string[]): string {
  for (const name of names) {
    const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match?.[1]) return decode(match[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
}

function linkOf(xml: string): string {
  const atom = xml.match(/<link[^>]+(?:rel=["']alternate["'][^>]+)?href=["']([^"']+)["'][^>]*>/i);
  return decode(atom?.[1] ?? tag(xml, ["link", "guid"]));
}

export function parseAtom(xml: string, id: FeedProviderId = "feeds:rss"): SearchResult[] {
  const blocks = [...xml.matchAll(/<(entry|item)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((match) => match[2] ?? "");
  return blocks.map((block) => {
    const url = linkOf(block);
    return result(id, {
      title: tag(block, ["title"]) || url,
      url,
      snippet: excerptOf(tag(block, ["summary", "description", "content"])),
      publishedAt: iso(tag(block, ["published", "updated", "pubDate", "dc:date"])),
    });
  }).filter((entry) => /^https?:\/\//i.test(entry.url));
}

const FixtureSchema = z.object({ results: z.array(z.object({
  title: z.string(), url: z.string(), snippet: z.string(), publishedAt: z.string().nullable().optional(),
})) });

export function createFeedFixtureProvider(id: FeedProviderId): SearchProvider {
  const name = id.replace("feeds:", "");
  return {
    id,
    unavailableReason: () => null,
    async search(_query, opts: SearchOptions = {}) {
      try {
        const parsed = FixtureSchema.parse(JSON.parse(await readFixture(`radar-${name}`, opts.fixtureCase ?? "default")));
        return parsed.results.slice(0, opts.limit ?? 12).map((entry) => result(id, {
          title: entry.title, url: entry.url, snippet: entry.snippet, publishedAt: entry.publishedAt ?? null,
        }));
      } catch (error) {
        if (error instanceof FixtureNotFoundError) log.warn(`missing fixture for ${id}`);
        throw error;
      }
    },
  };
}
