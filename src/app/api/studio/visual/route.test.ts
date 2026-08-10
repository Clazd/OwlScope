import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ContentItem, Source } from "@/domain/studio/schema";

const dataDir = mkdtempSync(join(tmpdir(), "studio-visual-route-"));
process.env.DATA_DIR = dataDir;
process.env.SANDBOX_MODE = "true";
process.env.LOG_LEVEL = "error";

let visual: typeof import("./route");
let image: typeof import("../image/route");
let contentStore: typeof import("@/domain/studio/store").contentStore;
let sourceStore: typeof import("@/domain/studio/store").sourceStore;

beforeAll(async () => {
  const [personaStore, demo, visualRoute, imageRoute, store] = await Promise.all([
    import("@/domain/persona/store"),
    import("@/domain/persona/demo"),
    import("./route"),
    import("../image/route"),
    import("@/domain/studio/store"),
  ]);
  await personaStore.writeSnapshot(demo.buildDemoSnapshot("2026-08-10T00:00:00.000Z"));
  visual = visualRoute;
  image = imageRoute;
  contentStore = store.contentStore;
  sourceStore = store.sourceStore;
});

afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(dataDir, { recursive: true, force: true });
});

afterEach(() => vi.unstubAllGlobals());

// A literal public IP for the image too: the guard resolves hostnames, and a
// test that depends on DNS is a test that fails on a train. Each fixture gets
// its own image URL, because the byte cache is keyed by URL and a shared one
// would let an earlier test answer a later one's request.
function card(n: number): string {
  return `<html><head>
  <meta property="og:image" content="https://93.184.216.34/card-${n}.jpg">
  <meta property="og:site_name" content="Example Journal">
</head><body><p>${"Body text. ".repeat(20)}</p></body></html>`;
}

let counter = 0;

async function fixture(): Promise<{ content: ContentItem; source: Source; card: string }> {
  counter += 1;
  const source = await sourceStore.put({
    id: `src_r${counter}`,
    topicId: "t",
    url: `https://93.184.216.34/piece-${counter}`,
    title: "A piece",
    domain: "example.com",
    publishedAt: null,
    retrievedAt: "2026-08-10T00:00:00.000Z",
    excerpt: "",
    sourceQuality: "secondary",
    providerId: "native-model-search",
  });
  const content = await contentStore.put({
    id: `content-r${counter}`,
    topicId: "t",
    personaVersion: 1,
    status: "accepted",
    angle: "technical",
    thesis: "State survives context.",
    text: "Durable files beat larger windows.",
    sentences: [],
    characterCount: 34,
    fingerprintScore: 80,
    sourceIds: [source.id],
    critique: null,
    validation: null,
    similarity: null,
    reasoning: "",
    override: null,
    visualPrompt: null,
    thread: null,
    rejectionReasons: [],
    provider: "sandbox",
    model: "sandbox",
    runId: "r",
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    publishedAt: null,
    publicUrl: null,
  });
  return { content, source, card: card(counter) };
}

function get(url: string) {
  return new Request(url, { method: "GET" });
}

function html(body: string) {
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
}

describe("GET /api/studio/visual", () => {
  it("harvests the sources and returns what to credit", async () => {
    const { content, source, card: page } = await fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(html(page)));

    const response = await visual.GET(get(`http://localhost/api/studio/visual?contentId=${content.id}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sources).toEqual([
      expect.objectContaining({
        id: source.id,
        domain: "example.com",
        image: expect.objectContaining({ url: expect.stringContaining("93.184.216.34/card-"), credit: "Example Journal" }),
      }),
    ]);
    expect(body.visualPrompt).toBeNull();
  });

  it("refuses without a post to harvest for", async () => {
    expect((await visual.GET(get("http://localhost/api/studio/visual"))).status).toBe(400);
    expect((await visual.GET(get("http://localhost/api/studio/visual?contentId=nope"))).status).toBe(400);
  });
});

describe("POST /api/studio/visual", () => {
  it("writes an image prompt and stores it on the post", async () => {
    const { content } = await fixture();

    const response = await visual.POST(new Request("http://localhost/api/studio/visual", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentId: content.id }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.visualPrompt).toMatchObject({ aspectRatio: "16:9", model: "sandbox-fast" });
    expect(body.visualPrompt.prompt.length).toBeGreaterThan(40);
    // Persisted, so reopening the post does not pay for a second one.
    expect((await contentStore.get(content.id))?.visualPrompt?.concept).toBe(body.visualPrompt.concept);
  });
});

describe("GET /api/studio/image", () => {
  it("serves the bytes for a harvested source image", async () => {
    const { content, source, card: page } = await fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(html(page)));
    await visual.GET(get(`http://localhost/api/studio/visual?contentId=${content.id}`));

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(png, { status: 200, headers: { "content-type": "image/png" } })));

    const response = await image.GET(get(`http://localhost/api/studio/image?sourceId=${source.id}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
  });

  it("attaches a filename only when a download was asked for", async () => {
    const { content, source, card: page } = await fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(html(page)));
    await visual.GET(get(`http://localhost/api/studio/visual?contentId=${content.id}`));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/jpeg" } })));

    const plain = await image.GET(get(`http://localhost/api/studio/image?sourceId=${source.id}`));
    expect(plain.headers.get("content-disposition")).toBeNull();

    const download = await image.GET(get(`http://localhost/api/studio/image?sourceId=${source.id}&download=1`));
    expect(download.headers.get("content-disposition")).toContain("example.com.jpg");
  });

  it("will not fetch a URL it was handed, only one a harvest already stored", async () => {
    // The whole point: no parameter here can name a host, so this endpoint can
    // never become an open proxy sitting inside the SSRF guard.
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    const missing = await image.GET(get("http://localhost/api/studio/image?sourceId=src_nothing"));
    expect(missing.status).toBe(404);

    const { source } = await fixture();
    const unharvested = await image.GET(get(`http://localhost/api/studio/image?sourceId=${source.id}`));
    expect(unharvested.status).toBe(404);
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses to relay something that is not an image", async () => {
    const { content, source, card: page } = await fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(html(page)));
    await visual.GET(get(`http://localhost/api/studio/visual?contentId=${content.id}`));

    // A page can nominate anything as its og:image, including an error page.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("<html>404</html>", { status: 200, headers: { "content-type": "text/html" } }),
    ));

    const response = await image.GET(get(`http://localhost/api/studio/image?sourceId=${source.id}`));
    expect(response.status).toBe(415);
    expect((await response.json()).error).toContain("not an image");
  });
});
