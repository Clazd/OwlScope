import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dataDir = mkdtempSync(join(tmpdir(), "studio-feed-cache-"));
process.env.DATA_DIR = dataDir;

let cache: typeof import("./feed-cache");

beforeAll(async () => { cache = await import("./feed-cache"); });
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("feed cache", () => {
  it("serves a repeated read inside the TTL and expires outside it", async () => {
    const url = "https://example.com/feed.xml";
    await cache.writeFeedCache(url, "<rss>cached</rss>", "application/rss+xml");
    await expect(cache.readFeedCache(url, 30 * 60 * 1000)).resolves.toMatchObject({ body: "<rss>cached</rss>" });
    await expect(cache.readFeedCache(url, 0)).resolves.toBeNull();
  });
});
