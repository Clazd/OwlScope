import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Source } from "./schema";

const dataDir = mkdtempSync(join(tmpdir(), "studio-visual-"));
process.env.DATA_DIR = dataDir;
process.env.LOG_LEVEL = "error";

let harvestSourceImages: typeof import("./visual").harvestSourceImages;
let sourceStore: typeof import("./store").sourceStore;

beforeAll(async () => {
  const [visual, store] = await Promise.all([import("./visual"), import("./store")]);
  harvestSourceImages = visual.harvestSourceImages;
  sourceStore = store.sourceStore;
});

afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(dataDir, { recursive: true, force: true });
});

afterEach(() => vi.unstubAllGlobals());

let counter = 0;

async function source(overrides: Partial<Source> = {}): Promise<Source> {
  counter += 1;
  return sourceStore.put({
    id: `src_v${counter}`,
    topicId: "t",
    // A literal public IP keeps the SSRF guard off DNS in the test.
    url: `https://93.184.216.34/article-${counter}`,
    title: "An article",
    domain: "example.com",
    publishedAt: null,
    retrievedAt: "2026-08-10T00:00:00.000Z",
    excerpt: "",
    sourceQuality: "secondary",
    providerId: "native-model-search",
    ...overrides,
  });
}

function page(html: string) {
  return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
}

const CARD = `<html><head>
  <meta property="og:image" content="https://cdn.example.com/card.jpg">
  <meta property="og:image:alt" content="A chart">
  <meta property="og:site_name" content="Example Journal">
</head><body><p>${"Body text. ".repeat(20)}</p></body></html>`;

describe("harvesting source images", () => {
  it("stores the image a source page offers, with its credit", async () => {
    const item = await source();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page(CARD)));

    const report = await harvestSourceImages([item]);

    expect(report.unreachable).toEqual([]);
    expect(report.sources[0]?.image).toMatchObject({
      url: "https://cdn.example.com/card.jpg",
      alt: "A chart",
      credit: "Example Journal",
    });
    // Persisted, so the next view of the same post costs nothing.
    expect((await sourceStore.get(item.id))?.image?.url).toBe("https://cdn.example.com/card.jpg");
  });

  it("records that a page offering nothing was asked, so it is asked only once", async () => {
    const item = await source();
    const request = vi.fn().mockResolvedValue(page("<html><body><p>No card here at all, just prose.</p></body></html>"));
    vi.stubGlobal("fetch", request);

    const first = await harvestSourceImages([item]);
    expect(first.sources[0]?.image).toBeNull();
    expect(first.sources[0]?.imageCheckedAt).toBeTruthy();

    const second = await harvestSourceImages(first.sources);
    expect(second.sources[0]?.image).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not let one dead host cost the others their images", async () => {
    const good = await source();
    const bad = await source({ domain: "down.example" });
    const request = vi.fn().mockImplementation((target: URL | string) => {
      if (String(target).includes(bad.url)) return Promise.reject(new TypeError("fetch failed"));
      return Promise.resolve(page(CARD));
    });
    vi.stubGlobal("fetch", request);

    const report = await harvestSourceImages([good, bad]);

    expect(report.sources.find((item) => item.id === good.id)?.image?.url).toBe("https://cdn.example.com/card.jpg");
    expect(report.unreachable).toEqual(["down.example"]);
  });

  it("leaves an unreachable source unchecked, so a bad day does not become permanent", async () => {
    const item = await source({ domain: "flaky.example" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await harvestSourceImages([item]);

    expect((await sourceStore.get(item.id))?.imageCheckedAt).toBeFalsy();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(page(CARD)));
    const retry = await harvestSourceImages([item]);
    expect(retry.sources[0]?.image?.url).toBe("https://cdn.example.com/card.jpg");
  });

  it("asks nothing when every source has already been checked", async () => {
    const item = await source({ imageCheckedAt: "2026-08-10T00:00:00.000Z", image: null });
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    const report = await harvestSourceImages([item]);

    expect(request).not.toHaveBeenCalled();
    expect(report.sources).toEqual([item]);
  });
});
