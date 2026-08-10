import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ContentItem, Sentence, Source } from "@/domain/studio/schema";

const dataDir = mkdtempSync(join(tmpdir(), "studio-thread-route-"));
process.env.DATA_DIR = dataDir;
process.env.SANDBOX_MODE = "true";
process.env.LOG_LEVEL = "error";

let thread: typeof import("./route");
let visual: typeof import("../visual/route");
let contentStore: typeof import("@/domain/studio/store").contentStore;
let sourceStore: typeof import("@/domain/studio/store").sourceStore;

const POST_ONE =
  "Most agent frameworks fail on long tasks because context windows are not memory. " +
  "A controlled evaluation found no correlation between window size and completion past thirty steps.";

beforeAll(async () => {
  const [personaStore, demo, threadRoute, visualRoute, store] = await Promise.all([
    import("@/domain/persona/store"),
    import("@/domain/persona/demo"),
    import("./route"),
    import("../visual/route"),
    import("@/domain/studio/store"),
  ]);
  await personaStore.writeSnapshot(demo.buildDemoSnapshot("2026-08-10T00:00:00.000Z"));
  thread = threadRoute;
  visual = visualRoute;
  contentStore = store.contentStore;
  sourceStore = store.sourceStore;
}, 30_000);

afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

function sentence(id: string, text: string, sourceIds: string[]): Sentence {
  return { id, text, claimType: "fact", sourceIds, support: "supported" };
}

/**
 * Already harvested, so nothing in these tests reaches the network: the point
 * here is the route, not the fetch it shares with the visual panel.
 */
function source(id: string, hasImage: boolean): Source {
  return {
    id,
    topicId: "t",
    title: `Source ${id}`,
    url: `https://example.com/${id}`,
    domain: "example.com",
    publishedAt: null,
    retrievedAt: "2026-08-10T00:00:00.000Z",
    excerpt: "",
    sourceQuality: "secondary",
    providerId: "native-model-search",
    image: hasImage ? { url: `https://example.com/${id}.jpg`, alt: "", width: null, height: null, credit: "" } : null,
    imageCheckedAt: "2026-08-10T00:00:00.000Z",
  };
}

let counter = 0;

async function fixture(): Promise<ContentItem> {
  counter += 1;
  await Promise.all([
    sourceStore.put(source("src_ca5dcd", true)),
    sourceStore.put(source("src_83a6b4", true)),
    sourceStore.put(source("src_e05b60", false)),
  ]);
  return contentStore.put({
    id: `content-t${counter}`,
    topicId: "t",
    personaVersion: 1,
    status: "accepted",
    angle: "technical",
    thesis: "Context length is not memory.",
    text: POST_ONE,
    sentences: [
      sentence("s1", "Most agent frameworks fail on long tasks because context windows are not memory.", ["src_ca5dcd"]),
      sentence("s2", "A controlled evaluation found no correlation between window size and completion past thirty steps.", ["src_83a6b4"]),
    ],
    characterCount: POST_ONE.length,
    fingerprintScore: 80,
    sourceIds: ["src_ca5dcd", "src_83a6b4", "src_e05b60"],
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
}

function post(body: unknown, path = "http://localhost/api/studio/thread") {
  return new Request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/studio/thread", () => {
  it("expands the post into a thread and stores it on the post", async () => {
    const content = await fixture();

    const response = await thread.POST(post({ contentId: content.id }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.thread.posts).toHaveLength(4);
    // Post 1 is the finalised post, byte for byte. The model never gets it back.
    expect(body.thread.posts[0].text).toBe(POST_ONE);
    expect(body.thread.validation.canPublish).toBe(true);

    const saved = await contentStore.get(content.id);
    expect(saved?.thread?.posts).toHaveLength(4);
    expect(saved?.thread?.runId).toBe(body.runId);
  }, 30_000);

  it("refuses without a post to expand", async () => {
    expect((await thread.POST(post({}))).status).toBe(400);
    expect((await thread.POST(post({ contentId: "nope" }))).status).toBe(400);
  });

  it("hands the thread to the panel that renders it", async () => {
    const content = await fixture();
    await thread.POST(post({ contentId: content.id }));

    const response = await visual.GET(
      new Request(`http://localhost/api/studio/visual?contentId=${content.id}`, { method: "GET" }),
    );
    const body = await response.json();

    expect(body.thread.posts).toHaveLength(4);
    expect(body.thread.posts[1].imageSourceIds).toEqual(["src_83a6b4"]);
  }, 30_000);
});

describe("POST /api/studio/visual with a post index", () => {
  it("writes the brief onto that post of the thread, not onto the post itself", async () => {
    const content = await fixture();
    await thread.POST(post({ contentId: content.id }));

    const response = await visual.POST(
      post({ contentId: content.id, postIndex: 3 }, "http://localhost/api/studio/visual"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.thread.posts[2].visualPrompt.concept.length).toBeGreaterThan(0);
    expect(body.thread.posts[1].visualPrompt).toBeNull();

    const saved = await contentStore.get(content.id);
    // The lone-post brief is a different field and stays empty.
    expect(saved?.visualPrompt).toBeNull();
    expect(saved?.thread?.posts[2]?.visualPrompt?.aspectRatio).toBe("16:9");
  }, 30_000);

  it("reuses the post's own brief for post 1 rather than paying for it twice", async () => {
    const content = await fixture();
    await visual.POST(post({ contentId: content.id }, "http://localhost/api/studio/visual"));
    await thread.POST(post({ contentId: content.id }));

    const response = await visual.POST(
      post({ contentId: content.id, postIndex: 1 }, "http://localhost/api/studio/visual"),
    );
    const body = await response.json();

    expect(body.reused).toBe(true);
    expect(body.runId).toBeUndefined();
    expect(body.thread.posts[0].visualPrompt.concept).toBe(body.visualPrompt.concept);
  }, 30_000);

  it("refuses an index the thread does not have", async () => {
    const content = await fixture();
    const response = await visual.POST(
      post({ contentId: content.id, postIndex: 9 }, "http://localhost/api/studio/visual"),
    );
    expect(response.status).toBe(400);
  });
});
