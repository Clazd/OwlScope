import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { scoreAgainstFingerprint } from "@/domain/persona/fingerprint";
import type { Fingerprint, Pillar } from "@/domain/persona/schema";
import { deduplicateResults } from "@/domain/radar/dedupe";
import { runBoundaryCheck } from "@/domain/studio/boundary";
import { evaluateGates } from "@/domain/studio/gates";
import { critiqueIdea, thesisIsSpecific } from "@/domain/studio/idea";
import { AnglesOutputSchema, DraftsOutputSchema, ResearchOutputSchema, type ContentItem, type Topic } from "@/domain/studio/schema";
import { analyseCadence, pickCadenceAwareAngle } from "@/domain/today/cadence";
import { skipCardCopy } from "@/domain/today/presentation";
import { createAnthropicProvider } from "@/services/ai/anthropic";
import { createSandboxProvider } from "@/services/ai/sandbox";
import { createSimilarityService } from "@/services/memory/similarity";
import type { SearchResult } from "@/services/search/provider";

const sandbox = createSandboxProvider({ fast: "sandbox-fast", strong: "sandbox-strong" });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Eval attempted a network call"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Slice 6 deterministic seed evals", () => {
  it("A · flags a generic AI idea and returns a specific thesis", async () => {
    const critique = critiqueIdea("Talk about AI changing the world");
    expect(critique.generic, "idea critic must name broad genericness").toBe(true);
    const generated = await sandbox.completeStructured({ stage: "angles", tier: "strong", prompt: "Generate a specific thesis.", schema: AnglesOutputSchema, schemaName: "AnglesOutput" });
    expect(generated.data.angles.some((angle) => thesisIsSpecific(angle.thesis)), "generator must return at least one mechanism-level thesis").toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("B · never invents first-person product usage absent from experience", async () => {
    const generated = await sandbox.completeStructured({ stage: "drafts", tier: "strong", prompt: "Experience log: empty.", schema: DraftsOutputSchema, schemaName: "DraftsOutput" });
    const inventedUsage = generated.data.drafts.some((draft) => /\b(?:i|we)\s+(?:used|tried|tested|built|shipped|adopted)\b/i.test(draft.text));
    expect(inventedUsage, "no draft may claim unlogged first-person product usage").toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("C · reports research unavailable when providers return no usable evidence", async () => {
    const research = await sandbox.completeStructured({ stage: "research", tier: "strong", prompt: "All search providers are disabled.", fixtureCase: "insufficient", schema: ResearchOutputSchema, schemaName: "ResearchOutput" });
    expect(research.data.insufficient, "current topic must stop when research is unavailable").toBe(true);
    expect(research.data.facts, "no current detail may be invented").toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("D · blocks a seeded duplicate and leaves room for another angle", async () => {
    const service = createSimilarityService();
    const prior = { id: "prior", topic: "Agent memory", thesis: "Context windows are not memory", text: "Context windows are not memory. Agents need durable state." };
    const result = await service.compare({ ...prior, id: "candidate", thesis: "Context windows aren't memory" }, [prior]);
    expect(result.risk, "matching thesis must be blocked or warned").not.toBe("low");
    expect(result.matches.length, "overlap must identify the prior post").toBeGreaterThan(0);
  });

  it("E · renders the honest skip result when every candidate is below threshold", () => {
    const copy = skipCardCopy({ skipReason: "I looked at 5 things. All five were below the quality threshold.", consideredCount: 5, rejectedSimilar: 0, rejectedWeak: 5 });
    expect(copy.heading, "skip card heading must be explicit").toBe("I would skip today.");
    expect(copy.explanation, "skip card must state the actual outcome").toContain("5 things");
  });

  it("F · rejects a boundary topic before any writing call", async () => {
    let writingCalls = 0;
    const boundary = await runBoundaryCheck({ title: "Election endorsements", summary: "Who should win the election", boundaries: [{ id: "politics", kind: "politics", value: "Politics", enabled: true }] });
    if (!boundary.blocked) writingCalls += 1;
    expect(boundary.blocked, "boundary must stop the topic").toBe(true);
    expect(writingCalls, "writer must never be reached").toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("G · attempts one structured repair, then fails the stage cleanly", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "{ malformed" }], usage: { input_tokens: 10, output_tokens: 2 }, model: "test" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createAnthropicProvider({ apiKey: "test", baseUrl: "https://provider.invalid", models: { fast: "test", strong: "test" } });
    const call = provider.completeStructured({ stage: "eval-malformed", tier: "fast", prompt: "Return value", schema: z.object({ value: z.string() }), schemaName: "Value" });
    await expect(call, "stage must fail loudly after the repair").rejects.toMatchObject({ category: "schema" });
    expect(fetchMock, "exactly one repair means exactly two provider calls").toHaveBeenCalledTimes(2);
  });

  it("H · blocks finalisation and names an unsupported factual sentence", () => {
    const report = evaluateGates({ sentences: [{ id: "s1", text: "Unsupported fact.", claimType: "fact", sourceIds: [], support: "unsupported" }], characterCount: 17, validation: null, critique: null, similarity: null, fingerprintScore: 100, fingerprintScored: false, fingerprintDeviations: [], boundaryBlocked: false, boundaryExplanation: "", staleAsCurrent: false, overriddenSentenceIds: [] });
    expect(report.canFinalise, "unsupported fact must block finalisation").toBe(false);
    expect(report.blocking.some((finding) => finding.sentenceId === "s1" && finding.id.startsWith("unsupported:")), "UI finding must point to the exact sentence").toBe(true);
  });

  it("I · names the exact avoided opening pattern", () => {
    const result = scoreAgainstFingerprint("Here's the thing: bigger models are not memory.", fingerprint());
    expect(result.deviations.find((item) => item.rule === "avoided-opening")?.message, "critic must quote the matched pattern").toContain(`"Here's the thing"`);
  });

  it("J · biases away from four consecutive explanatory posts", () => {
    const history = [0, 1, 2, 3, 4].map((index) => content(`c${index}`, index < 4 ? "explanation" : "technical", `2026-08-0${9 - index}T08:00:00.000Z`));
    const cadence = analyseCadence(history, [topic()], [pillar()]);
    const selected = pickCadenceAwareAngle([{ id: "explain", kind: "explanation", thesis: "Explain", whyItFits: "", evidenceNeeded: [], noveltyRisk: "low", noveltyNote: "" }, { id: "opinion", kind: "opinion", thesis: "Opinion", whyItFits: "", evidenceNeeded: [], noveltyRisk: "low", noveltyNote: "" }], cadence);
    expect(cadence.debts.some((debt) => debt.dimension === "angle" && debt.value === "explanation"), "four-post streak must create angle debt").toBe(true);
    expect(selected?.kind, "next selection should prefer another supported angle").not.toBe("explanation");
  });

  it("K · deduplicates one story from three providers and keeps provenance", () => {
    const results = deduplicateResults([source("hn", "Agent memory is durable state", "https://example.com/story?utm_source=hn"), source("reddit", "Agent memory is durable state", "https://reddit.com/r/ai/story"), source("rss", "Agent memory is durable state", "https://blog.example.org/story")]);
    expect(results, "three provider copies must become one candidate").toHaveLength(1);
    expect(results[0]?.sources, "the candidate must retain all three sources").toHaveLength(3);
  });
});

function source(providerId: string, title: string, url: string): SearchResult { return { providerId, title, url, domain: new URL(url).hostname, snippet: providerId, publishedAt: null, retrievedAt: "2026-08-09T00:00:00.000Z" }; }
function pillar(): Pillar { return { id: "p", name: "AI", description: "", weight: 100, enabled: true, freshnessPreference: "balanced", subtopics: [] }; }
function topic(): Topic { return { id: "t", title: "Agents", summary: "", sourceType: "manual", pillarId: "p", freshness: "evergreen", status: "used", context: "", scoreComponents: null, createdAt: "2026-08-01T00:00:00.000Z" }; }
function content(id: string, angle: string, publishedAt: string): ContentItem { return { id, topicId: "t", personaVersion: 1, status: "published", angle, thesis: angle, text: `${angle} post.`, sentences: [{ id: `${id}-s`, text: `${angle} post.`, claimType: "opinion", sourceIds: [], support: "n/a" }], characterCount: 40, fingerprintScore: 90, sourceIds: [], critique: null, validation: null, similarity: null, reasoning: "", override: null, visualPrompt: null, thread: null, rejectionReasons: [], provider: "sandbox", model: "sandbox", runId: id, createdAt: publishedAt, updatedAt: publishedAt, publishedAt, publicUrl: null }; }
function fingerprint(): Fingerprint { return { id: "fingerprint", sentenceLength: { median: 11, p10: 4, p90: 24 }, postLength: { median: 180, p90: 260 }, punctuation: { emDash: "never", semicolon: "never", ellipsis: "rare", listMarkers: "never" }, emojiUse: "none", hashtagUse: "none", openingPatterns: ["direct claim"], avoidedOpenings: ["Here's the thing"], capitalisation: "Sentence case.", vocabulary: { preferred: [], absent: [] }, structuralHabits: [], derivedFromCount: 20, editedByUser: false, createdAt: "2026-08-09T00:00:00.000Z" }; }
