import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Persona } from "@/domain/persona/schema";
import type { ContentItem, Sentence, Source, ThreadPost, ValidationOutput } from "./schema";

/**
 * The thread stage, in sandbox mode against a throwaway /data.
 *
 * The pure half is where the guarantees live - which post keeps which image,
 * what happens to a citation nobody can resolve, and what a post says about
 * itself when the validator never ran - so most of this file is pure functions
 * with no provider anywhere near them.
 */

const dataDir = mkdtempSync(join(tmpdir(), "studio-thread-"));
process.env.DATA_DIR = dataDir;
process.env.SANDBOX_MODE = "true";
process.env.LOG_LEVEL = "error";

let thread: typeof import("./thread");
let session: typeof import("./session");
let store: typeof import("./store");
let persona: Persona;
let sources: Source[];

const POST_ONE =
  "Most agent frameworks fail on long tasks because context windows are not memory. " +
  "A controlled evaluation found no correlation between window size and completion past thirty steps.";

function sentence(overrides: Partial<Sentence> & Pick<Sentence, "id" | "text">): Sentence {
  return { claimType: "fact", sourceIds: [], support: "supported", ...overrides };
}

function content(overrides: Partial<ContentItem> = {}): Pick<
  ContentItem,
  "text" | "angle" | "thesis" | "sentences" | "characterCount" | "visualPrompt"
> {
  return {
    text: POST_ONE,
    angle: "technical",
    thesis: "Context length is not memory.",
    sentences: [
      sentence({ id: "s1", text: "Most agent frameworks fail on long tasks because context windows are not memory.", claimType: "inference", sourceIds: ["src_ca5dcd"] }),
      sentence({ id: "s2", text: "A controlled evaluation found no correlation between window size and completion past thirty steps.", sourceIds: ["src_83a6b4"] }),
    ],
    characterCount: POST_ONE.length,
    visualPrompt: null,
    ...overrides,
  };
}

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

beforeAll(async () => {
  const [personaStore, defaults, threadMod, sessionMod, storeMod] = await Promise.all([
    import("@/domain/persona/store"),
    import("@/domain/persona/defaults"),
    import("./thread"),
    import("./session"),
    import("./store"),
  ]);
  thread = threadMod;
  session = sessionMod;
  store = storeMod;

  persona = {
    ...defaults.emptyPersona(),
    name: "Nova",
    identityStatement: "An engineer who writes about how systems actually behave.",
    activeVersion: 2,
  };
  await personaStore.writePersona(persona);

  // The ids the thread fixture cites, so its citations resolve.
  sources = await Promise.all(
    [["src_ca5dcd", true], ["src_83a6b4", true], ["src_e05b60", false]].map(([id, image]) =>
      store.sourceStore.put(source(id as string, image as boolean)),
    ),
  );
}, 30_000);

afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

/* ------------------------------------------------------------------ pure -- */

describe("assembling a thread", () => {
  it("carries post 1 over untouched, because it is the post that passed the gates", () => {
    const posts = thread.assembleThread(content(), [
      { text: "A second post.", sentences: [sentence({ id: "s1", text: "A second post.", claimType: "opinion", support: "n/a" })] },
    ], sources);

    expect(posts[0]).toMatchObject({ index: 1, text: POST_ONE });
    expect(posts[0]?.sentences.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("gives every continuation sentence an id unique across the whole thread", () => {
    const posts = thread.assembleThread(content(), [
      { text: "Two. Two again.", sentences: [sentence({ id: "s1", text: "Two.", claimType: "opinion", support: "n/a" }), sentence({ id: "s1", text: "Two again.", claimType: "opinion", support: "n/a" })] },
      { text: "Three.", sentences: [sentence({ id: "s1", text: "Three.", claimType: "opinion", support: "n/a" })] },
    ], sources);

    const ids = posts.flatMap((post) => post.sentences.map((s) => s.id));
    expect(ids).toEqual(["s1", "s2", "p2s1", "p2s2", "p3s1"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("drops a citation to a source that does not exist and says so", () => {
    const posts = thread.assembleThread(content(), [
      { text: "A cited claim.", sentences: [sentence({ id: "s1", text: "A cited claim.", sourceIds: ["src_ca5dcd", "src_nope"] })] },
    ], sources);

    expect(posts[1]?.sentences[0]?.sourceIds).toEqual(["src_ca5dcd"]);
    expect(posts[1]?.warnings.join(" ")).toContain("src_nope");
  });

  it("counts each post on its own, so one long post is visible rather than averaged away", () => {
    const long = "x".repeat(300);
    const posts = thread.assembleThread(content(), [
      { text: "Short.", sentences: [sentence({ id: "s1", text: "Short.", claimType: "opinion", support: "n/a" })] },
      { text: long, sentences: [sentence({ id: "s1", text: long, claimType: "opinion", support: "n/a" })] },
    ], sources);

    expect(posts[1]?.warnings).toEqual([]);
    expect(posts[2]?.characterCount).toBe(300);
    expect(posts[2]?.warnings.join(" ")).toContain("past the 280 limit");
  });

  it("never returns more posts than a thread can usefully be", () => {
    const many = Array.from({ length: 12 }, (_, n) => ({
      text: `Post ${n}.`,
      sentences: [sentence({ id: "s1", text: `Post ${n}.`, claimType: "opinion", support: "n/a" })],
    }));
    expect(thread.assembleThread(content(), many, sources)).toHaveLength(thread.MAX_THREAD_POSTS);
  });
});

describe("assigning images", () => {
  it("gives a post the images of the sources it actually cites", () => {
    const assigned = thread.assignThreadImages([
      { sentences: [sentence({ id: "a", text: "a", sourceIds: ["src_83a6b4"] })] },
      { sentences: [sentence({ id: "b", text: "b", sourceIds: ["src_ca5dcd"] })] },
    ], sources);

    expect(assigned).toEqual([["src_83a6b4"], ["src_ca5dcd"]]);
  });

  it("does not offer the same card twice, because the second showing adds nothing", () => {
    const assigned = thread.assignThreadImages([
      { sentences: [sentence({ id: "a", text: "a", sourceIds: ["src_ca5dcd"] })] },
      { sentences: [sentence({ id: "b", text: "b", sourceIds: ["src_ca5dcd"] })] },
    ], sources);

    expect(assigned).toEqual([["src_ca5dcd"], []]);
  });

  it("skips a cited source that has no image", () => {
    const assigned = thread.assignThreadImages([
      { sentences: [sentence({ id: "a", text: "a", sourceIds: ["src_e05b60", "src_ca5dcd"] })] },
    ], sources);

    expect(assigned).toEqual([["src_ca5dcd"]]);
  });

  it("gives every post one before it gives any post two", () => {
    const assigned = thread.assignThreadImages([
      { sentences: [sentence({ id: "a", text: "a", sourceIds: ["src_ca5dcd", "src_83a6b4"] })] },
      { sentences: [sentence({ id: "b", text: "b", sourceIds: ["src_83a6b4"] })] },
    ], sources);

    // The greedy version hands post 1 both and leaves post 2 bare.
    expect(assigned).toEqual([["src_ca5dcd"], ["src_83a6b4"]]);
  });

  it("stops at four, which is what X accepts", () => {
    const many = Array.from({ length: 6 }, (_, n) => source(`src_many${n}`, true));
    const assigned = thread.assignThreadImages(
      [{ sentences: [sentence({ id: "a", text: "a", sourceIds: many.map((s) => s.id) })] }],
      many,
    );

    expect(assigned[0]).toHaveLength(thread.MAX_IMAGES_PER_POST);
  });
});

describe("settling support from the validator", () => {
  const base: ThreadPost[] = [
    { index: 1, text: POST_ONE, sentences: [], characterCount: 10, imageSourceIds: [], visualPrompt: null, warnings: [] },
    {
      index: 2,
      text: "A claim. A view.",
      sentences: [
        sentence({ id: "p2s1", text: "A claim.", sourceIds: ["src_ca5dcd"] }),
        sentence({ id: "p2s2", text: "A view.", claimType: "opinion", support: "n/a" }),
      ],
      characterCount: 16,
      imageSourceIds: [],
      visualPrompt: null,
      warnings: [],
    },
  ];

  function verdicts(sentences: ValidationOutput["sentences"]): ValidationOutput {
    return { sentences, canPublish: true, blockingReasons: [] };
  }

  it("flags a factual claim the sources do not carry", () => {
    const posts = thread.finaliseThreadPosts(base, verdicts([
      { id: "p2s1", support: "unsupported", sourceIds: [], notes: "Nothing states this." },
    ]));

    expect(posts[1]?.sentences[0]?.support).toBe("unsupported");
    expect(posts[1]?.warnings.join(" ")).toContain("p2s1 states a fact nothing retrieved supports");
  });

  it("leaves an opinion as n/a rather than marking it unsupported for not being a fact", () => {
    const posts = thread.finaliseThreadPosts(base, verdicts([
      { id: "p2s2", support: "unsupported", sourceIds: [], notes: "No valid source was named." },
    ]));

    expect(posts[1]?.sentences[1]?.support).toBe("n/a");
    expect(posts[1]?.warnings).toEqual([]);
  });

  it("says on every post when the validator never ran, rather than looking checked", () => {
    const posts = thread.finaliseThreadPosts(base, null);

    expect(posts[0]?.warnings).toEqual([]);
    expect(posts[1]?.warnings).toEqual(["Not checked against the sources: the validator did not run."]);
  });
});

/* ----------------------------------------------------------- end to end -- */

describe("running the stage", () => {
  it("writes a validated, image-assigned thread from the fixtures", async () => {
    const run = await session.beginRun(persona.activeVersion, null);
    const result = await thread.runThread({
      content: content(),
      research: null,
      sources,
      persona,
      recentPosts: [],
      recorder: run.recorder,
    });

    expect(result.posts).toHaveLength(4);
    expect(result.posts[0]?.text).toBe(POST_ONE);
    for (const post of result.posts) {
      expect(post.characterCount).toBeLessThanOrEqual(280);
      expect(post.warnings).toEqual([]);
    }

    // Every factual claim in the continuation still cites something.
    const facts = result.posts.slice(1).flatMap((post) => post.sentences).filter((s) => s.claimType === "fact");
    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) expect(fact.sourceIds.length).toBeGreaterThan(0);

    // The images spread down the thread rather than piling up on the first post.
    expect(result.posts.map((post) => post.imageSourceIds)).toEqual([["src_ca5dcd"], ["src_83a6b4"], [], []]);
    expect(result.validation?.canPublish).toBe(true);
  }, 30_000);
});
