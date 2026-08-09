import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Persona } from "@/domain/persona/schema";
import type { Angle, ContentItem, ResearchRecord, Source, StudioDraft, Topic, ValidationOutput } from "./schema";

/**
 * The whole pipeline, end to end, in sandbox mode against a throwaway /data.
 *
 * Slices 1 and 2 shipped without one of these and said so. It is worth having:
 * the unit tests pin each stage's rules, and this pins that the stages compose
 * - that research's source ids survive into the writer's citations, that the
 * validator's verdicts reach the gates, and that a finished post lands on disk
 * as a draft rather than as anything else.
 *
 * Zero network calls. Every model response and every search result comes from
 * `/fixtures`, which is the point: the awkward cases (an uncited fact, an empty
 * history, a blocked topic) cannot be produced on demand from a real provider.
 */

const dataDir = mkdtempSync(join(tmpdir(), "studio-pipeline-"));

process.env.DATA_DIR = dataDir;
process.env.SANDBOX_MODE = "true";
process.env.LOG_LEVEL = "error";

// Imported dynamically so the env above is in place before the storage layer
// resolves its paths at module load.
type Modules = {
  store: typeof import("./store");
  session: typeof import("./session");
  boundary: typeof import("./boundary");
  research: typeof import("./research");
  angles: typeof import("./angles");
  write: typeof import("./write");
  validate: typeof import("./validate");
  critique: typeof import("./critique");
  similarity: typeof import("./similarity");
  gates: typeof import("./gates");
  finalise: typeof import("./finalise");
};

let m: Modules;
let persona: Persona;
let recorder: Awaited<ReturnType<typeof import("./session").beginRun>>;
let topic: Topic;
let sources: Source[];
let research: ResearchRecord;
let angles: Angle[];
let angle: Angle;
let drafts: StudioDraft[];
let validation: ValidationOutput;
let item: ContentItem;

beforeAll(async () => {
  const [personaStore, defaults, ...rest] = await Promise.all([
    import("@/domain/persona/store"),
    import("@/domain/persona/defaults"),
    import("./store"),
    import("./session"),
    import("./boundary"),
    import("./research"),
    import("./angles"),
    import("./write"),
    import("./validate"),
    import("./critique"),
    import("./similarity"),
    import("./gates"),
    import("./finalise"),
  ]);
  const [store, session, boundary, researchMod, anglesMod, write, validate, critique, similarity, gates, finalise] =
    rest as [
      Modules["store"], Modules["session"], Modules["boundary"], Modules["research"], Modules["angles"],
      Modules["write"], Modules["validate"], Modules["critique"], Modules["similarity"], Modules["gates"],
      Modules["finalise"],
    ];
  m = { store, session, boundary, research: researchMod, angles: anglesMod, write, validate, critique, similarity, gates, finalise };

  persona = {
    ...defaults.emptyPersona(),
    name: "Nova",
    identityStatement: "An engineer who writes about how systems actually behave.",
    activeVersion: 3,
    boundaries: [{ id: "b1", kind: "politics", value: "Politics", enabled: true }],
  };
  await personaStore.writePersona(persona);
  await personaStore.writeFingerprint({
    id: "fingerprint",
    sentenceLength: { median: 14, p10: 6, p90: 24 },
    postLength: { median: 190, p90: 260 },
    punctuation: { emDash: "never", semicolon: "never", ellipsis: "never", listMarkers: "never" },
    emojiUse: "none",
    hashtagUse: "none",
    openingPatterns: ["a flat statement of the finding"],
    avoidedOpenings: ["Here's the thing"],
    capitalisation: "sentence case",
    vocabulary: { preferred: ["actually", "mechanism"], absent: ["unlock", "game-changer"] },
    structuralHabits: ["ends on the consequence"],
    derivedFromCount: 20,
    editedByUser: false,
    createdAt: new Date().toISOString(),
  });

  topic = await m.store.topicStore.put({
    id: m.store.newId(),
    title: "Agent frameworks and long-running tasks",
    summary: "Why agents lose the thread past forty tool calls.",
    sourceType: "manual",
    pillarId: null,
    freshness: "current",
    status: "discovered",
    context: "",
    scoreComponents: null,
    createdAt: new Date().toISOString(),
  });

  recorder = await m.session.beginRun(persona.activeVersion, null);
}, 30_000);

afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("stage 1 - topic and boundaries", () => {
  it("lets a topic that touches nothing through", async () => {
    const check = await m.boundary.runBoundaryCheck({
      title: topic.title,
      summary: topic.summary,
      boundaries: persona.boundaries,
      recorder: recorder.recorder,
    });
    expect(check.blocked).toBe(false);
  });

  it("blocks one that does, before any writing call exists", async () => {
    const check = await m.boundary.runBoundaryCheck({
      title: "What the election result means for procurement",
      summary: "",
      boundaries: persona.boundaries,
      recorder: recorder.recorder,
    });
    expect(check.blocked).toBe(true);
    expect(check.explanation).toContain("Politics");
  });
});

describe("stage 2 - research", () => {
  it("stores what it retrieved as source records", async () => {
    const result = await m.research.runResearch({ topic, recorder: recorder.recorder });
    research = result.record;
    sources = await m.store.sourcesForTopic(topic.id);
    expect(sources).toHaveLength(3);
    expect(research.insufficient).toBe(false);
    expect(research.facts.length).toBeGreaterThan(0);
  });

  it("classifies where each source came from", () => {
    expect(sources.map((source) => source.sourceQuality).sort()).toEqual(["forum", "primary", "secondary"]);
  });

  it("gives every fact a citation that resolves to a stored source", () => {
    const known = new Set(sources.map((source) => source.id));
    for (const fact of research.facts) {
      for (const id of fact.sourceIds) expect(known.has(id)).toBe(true);
    }
  });

  it("separates what a source says from what the model concluded", () => {
    expect(research.facts.some((fact) => fact.kind === "from-source")).toBe(true);
    expect(research.facts.some((fact) => fact.kind === "inference")).toBe(true);
  });

  it("is idempotent per URL, so re-running does not duplicate sources", async () => {
    await m.research.runResearch({ topic, recorder: recorder.recorder });
    expect(await m.store.sourcesForTopic(topic.id)).toHaveLength(3);
  });
});

describe("stage 3 - angles", () => {
  it("produces four to six that differ in kind, not in wording", async () => {
    const context = await m.session.loadContext();
    angles = await m.angles.runAngles({
      topic,
      research,
      sources,
      persona,
      recentPosts: context.recentPosts,
      experience: context.experience,
      recorder: recorder.recorder,
    });
    expect(angles.length).toBeGreaterThanOrEqual(4);
    expect(new Set(angles.map((entry) => entry.kind)).size).toBeGreaterThanOrEqual(4);
  });

  it("picks one and shows its reasoning", async () => {
    const context = await m.session.loadContext();
    const pick = await m.angles.runAnglePick({
      angles,
      persona,
      recentPosts: context.recentPosts,
      recorder: recorder.recorder,
    });
    angle = angles.find((entry) => entry.id === pick.angleId) as Angle;
    expect(angle).toBeDefined();
    expect(pick.reasoning.length).toBeGreaterThan(40);
  });
});

describe("stage 4 - drafts in the Evidence Lock shape", () => {
  it("writes three", async () => {
    const context = await m.session.loadContext();
    drafts = await m.write.runDrafts({
      topic,
      angle,
      research,
      sources,
      persona,
      fingerprint: context.fingerprint,
      experience: m.write.invitesFirstHandClaim(topic, angle) ? context.experience : null,
      recentPosts: context.recentPosts,
      count: 3,
      recorder: recorder.recorder,
    });
    expect(drafts).toHaveLength(3);
  });

  it("keeps the flattened text exactly reassemblable from the sentences", () => {
    for (const draft of drafts) {
      expect(draft.text).toBe(draft.sentences.map((sentence) => sentence.text).join(" "));
    }
  });

  it("renumbers sentence ids positionally", () => {
    for (const draft of drafts) {
      expect(draft.sentences.map((sentence) => sentence.id)).toEqual(
        draft.sentences.map((_, index) => `s${index + 1}`),
      );
    }
  });

  it("counts characters itself rather than believing the model", () => {
    for (const draft of drafts) {
      expect(draft.characterCount).toBe([...draft.text].length);
    }
  });

  it("forces an uncited factual claim to unsupported whatever the writer said", () => {
    // The third fixture draft cites nothing on s2 while claiming a fact.
    const uncited = drafts[2]?.sentences[1];
    expect(uncited?.claimType).toBe("fact");
    expect(uncited?.sourceIds).toEqual([]);
    expect(uncited?.support).toBe("unsupported");
  });
});

describe("stage 5 - validation, similarity, critique", () => {
  it("returns a verdict for every sentence", async () => {
    validation = await m.validate.runValidation({
      sentences: (drafts[0] as StudioDraft).sentences,
      sources,
      recorder: recorder.recorder,
    });
    expect(validation.sentences).toHaveLength((drafts[0] as StudioDraft).sentences.length);
    expect(validation.canPublish).toBe(true);
  });

  it("runs similarity against an empty history with no model call", async () => {
    const result = await m.similarity.checkSimilarity({
      candidate: {
        id: "",
        text: (drafts[0] as StudioDraft).text,
        topic: topic.title,
        thesis: angle.thesis,
      },
      history: [],
      recorder: recorder.recorder,
    });
    expect(result.result.risk).toBe("low");
    expect(result.result.usedModel).toBe(false);
    expect(result.l1.tokens.length).toBeGreaterThan(0);
  });

  it("reports without rewriting - there is nowhere to put a rewrite", async () => {
    const context = await m.session.loadContext();
    const critique = await m.critique.runCritique({
      text: (drafts[0] as StudioDraft).text,
      sentences: (drafts[0] as StudioDraft).sentences,
      sources,
      validation,
      similarity: null,
      persona,
      fingerprint: context.fingerprint,
      experience: context.experience,
      recentPosts: context.recentPosts,
      recorder: recorder.recorder,
    });
    expect(Object.keys(critique)).not.toContain("text");
    expect(critique.issues.length).toBeGreaterThan(0);
    // The score is measured in code, not asked of the critic.
    expect(critique.fingerprintScore).toBe((drafts[0] as StudioDraft).fingerprintScore);
  });
});

describe("stage 6 - gates and finalisation", () => {
  it("passes the clean draft and blocks the one with an uncited fact", () => {
    const clean = m.gates.evaluateGates({
      sentences: (drafts[0] as StudioDraft).sentences,
      characterCount: (drafts[0] as StudioDraft).characterCount,
      validation,
      critique: null,
      similarity: null,
      fingerprintScore: (drafts[0] as StudioDraft).fingerprintScore,
      fingerprintScored: (drafts[0] as StudioDraft).fingerprintScored,
      fingerprintDeviations: [],
      boundaryBlocked: false,
      boundaryExplanation: "",
      staleAsCurrent: false,
      overriddenSentenceIds: [],
    });
    expect(clean.canFinalise).toBe(true);

    const dirty = m.gates.evaluateGates({
      sentences: (drafts[2] as StudioDraft).sentences,
      characterCount: (drafts[2] as StudioDraft).characterCount,
      validation: null,
      critique: null,
      similarity: null,
      fingerprintScore: 90,
      fingerprintScored: true,
      fingerprintDeviations: [],
      boundaryBlocked: false,
      boundaryExplanation: "",
      staleAsCurrent: false,
      overriddenSentenceIds: [],
    });
    expect(dirty.canFinalise).toBe(false);
  });

  it("writes the content item as a draft, never as anything else", async () => {
    const context = await m.session.loadContext();
    const similarity = await m.similarity.checkSimilarity({
      candidate: { id: "", text: (drafts[0] as StudioDraft).text, topic: topic.title, thesis: angle.thesis },
      history: [],
      recorder: recorder.recorder,
      allowModel: false,
    });
    const reasoning = await m.finalise.runReasoning({
      topic,
      angle,
      draft: drafts[0] as StudioDraft,
      research,
      sources,
      similarity,
      recentPosts: context.recentPosts,
      recorder: recorder.recorder,
    });
    expect(reasoning.length).toBeGreaterThan(60);

    item = await m.finalise.createContentItem({
      topic,
      angle,
      draft: drafts[0] as StudioDraft,
      persona,
      validation,
      critique: null,
      similarity,
      reasoning,
      override: null,
      provider: recorder.provider,
      model: recorder.models.strong,
      runId: recorder.recorder.id,
    });
    expect(item.status).toBe("draft");
    expect(item.publishedAt).toBeNull();
    expect(item.personaVersion).toBe(3);
  });

  it("only stamps publishedAt on the explicit publish transition", async () => {
    await m.finalise.transitionContent({ contentId: item.id, to: "reviewing" });
    const accepted = await m.finalise.transitionContent({ contentId: item.id, to: "accepted" });
    expect(accepted.publishedAt).toBeNull();

    const published = await m.finalise.transitionContent({
      contentId: item.id,
      to: "published",
      publicUrl: "https://x.com/nova/1",
    });
    expect(published.publishedAt).not.toBeNull();
    expect(published.publicUrl).toBe("https://x.com/nova/1");
  });

  it("refuses to walk a published post back to draft", async () => {
    await expect(m.finalise.transitionContent({ contentId: item.id, to: "draft" })).rejects.toThrow();
  });
});

describe("memory, once there is a history", () => {
  it("catches the post it just published as a duplicate, on the free layers alone", async () => {
    const history = await m.store.contentHistory();
    expect(history.length).toBeGreaterThan(0);

    const result = await m.similarity.checkSimilarity({
      candidate: { id: "", text: (drafts[0] as StudioDraft).text, topic: topic.title, thesis: angle.thesis },
      history,
      recorder: recorder.recorder,
    });
    expect(result.result.risk).toBe("high");
    expect(result.result.usedModel).toBe(false);
  });
});

describe("the run record", () => {
  it("has a row for every stage the Inspector needs to show", async () => {
    const run = await recorder.recorder.finish("done");
    const stages = run.stages.map((stage) => stage.stage);
    for (const expected of ["boundary", "research", "angles", "drafts", "validate", "critique", "reasoning"]) {
      expect(stages).toContain(expected);
    }
    expect(run.sandbox).toBe(true);
  });

  it("records the prompt and the raw response for each, and no reasoning text", async () => {
    const run = recorder.recorder.current();
    for (const stage of run.stages) {
      if (stage.status === "skipped") continue;
      expect(stage.prompt.length).toBeGreaterThan(0);
      expect(stage.rawResponse.length).toBeGreaterThan(0);
      // The run schema has nowhere to put chain of thought, by design.
      expect(stage).not.toHaveProperty("reasoning");
    }
  });
});
