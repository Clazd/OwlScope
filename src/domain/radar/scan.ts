import "server-only";
import type { Pillar, Persona } from "@/domain/persona/schema";
import { readPersonaOrEmpty } from "@/domain/persona/store";
import { readSettings, writeSettings } from "@/domain/settings/store";
import type { RadarScoreComponents, Source, Topic } from "@/domain/studio/schema";
import { contentHistory, newId, sourceIdFor, sourceStore, sourcesForTopic, topicStore } from "@/domain/studio/store";
import { runStage } from "@/domain/studio/stage";
import { createLogger } from "@/lib/logging/log";
import { getProvider } from "@/services/ai/provider";
import { createSimilarityService } from "@/services/memory/similarity";
import { startRun, type Recorder } from "@/services/runs/recorder";
import { classifyQuality, domainOf } from "@/services/search/extract";
import {
  createArxivProvider,
  createDevCommunityProvider,
  createFeedFixtureProvider,
  createGitHubProvider,
  createHackerNewsProvider,
  createLobstersProvider,
  createOpenAlexProvider,
  createRedditProvider,
  createRssProvider,
  type FeedProviderId,
} from "@/services/search/feeds";
import { createFixtureSearchProvider } from "@/services/search/fixture";
import { createNativeSearchProvider, type NativeSearchOutcome } from "@/services/search/native";
import type { SearchProvider, SearchResult } from "@/services/search/provider";
import { bankTopic, expireBankedTopic } from "./bank";
import { deduplicateResults, normalisedTitle } from "./dedupe";
import { keywordsFor, queryFor } from "./query";
import {
  EvergreenOutputSchema,
  FastAssessmentSchema,
  StrongAssessmentSchema,
  type ProviderReport,
  type RadarCandidate,
  type RadarScanResult,
} from "./schema";
import {
  diversityScore,
  freshnessScore,
  heuristicPersonaRelevance,
  noveltyFromMatches,
  scoreLabel,
  sourceQualityScore,
  weightedScore,
} from "./scoring";

const log = createLogger("radar/scan");
const PROVIDER_LIMIT = 16;

export type RadarProgressEvent =
  | { phase: "provider"; report: ProviderReport }
  | { phase: "stage"; stage: "novelty" | "fast" | "strong" | "bank"; detail: string };
type ProgressSink = (event: RadarProgressEvent) => void | Promise<void>;

function pillarFor(candidate: Pick<RadarCandidate, "title" | "summary">, pillars: Pillar[]): string | null {
  const text = `${candidate.title} ${candidate.summary}`.toLowerCase();
  const ranked = pillars.filter((pillar) => pillar.enabled).map((pillar) => ({
    id: pillar.id,
    score: [pillar.name, ...pillar.subtopics].filter((word) => text.includes(word.toLowerCase())).length,
  })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score ? ranked[0].id : null;
}

async function recordProvider(
  recorder: Recorder,
  report: ProviderReport,
  latencyMs: number,
  usage?: NativeSearchOutcome,
): Promise<void> {
  await recorder.record({
    stage: `provider:${report.id}`,
    model: usage?.model ?? "none",
    prompt: usage?.prompt ?? "",
    rawResponse: usage?.rawResponse ?? "",
    parsed: usage ? { ...report, searchCount: usage.searchCount, droppedUrls: usage.droppedUrls } : report,
    validationError: report.status === "degraded" ? report.message : null,
    latencyMs,
    tokensIn: usage?.tokensIn ?? 0,
    tokensOut: usage?.tokensOut ?? 0,
    status: "done",
  });
}

interface ProviderEntry {
  id: string;
  enabled: boolean;
  provider: SearchProvider | null;
  detailedSearch?: (query: string) => Promise<NativeSearchOutcome>;
}

async function providerEntries(sandbox: boolean, settings: Awaited<ReturnType<typeof readSettings>>): Promise<ProviderEntry[]> {
  const config = settings.radar;
  const resolved = await getProvider();
  const feed = (id: FeedProviderId, real: () => SearchProvider): SearchProvider => sandbox ? createFeedFixtureProvider(id) : real();
  const native = sandbox ? null : createNativeSearchProvider(resolved.provider);
  return [
    {
      id: "native-model-search",
      enabled: config.providers.nativeModelSearch.enabled,
      provider: sandbox ? createFixtureSearchProvider() : native,
      detailedSearch: native
        ? (query) => native.searchDetailed(query, {
          limit: PROVIDER_LIMIT,
          tier: "fast",
          stage: "radar-search",
          maxSearches: 2,
        })
        : undefined,
    },
    { id: "feeds:hacker-news", enabled: config.providers.hackerNews.enabled, provider: feed("feeds:hacker-news", () => createHackerNewsProvider(config.hackerNews)) },
    { id: "feeds:reddit", enabled: config.providers.reddit.enabled, provider: feed("feeds:reddit", () => createRedditProvider(config.reddit)) },
    { id: "feeds:arxiv", enabled: config.providers.arxiv.enabled, provider: feed("feeds:arxiv", () => createArxivProvider(config.arxiv)) },
    { id: "feeds:github", enabled: config.providers.github.enabled, provider: feed("feeds:github", () => createGitHubProvider(config.github)) },
    { id: "feeds:dev-community", enabled: config.providers.devCommunity.enabled, provider: feed("feeds:dev-community", () => createDevCommunityProvider(config.devCommunity)) },
    { id: "feeds:lobsters", enabled: config.providers.lobsters.enabled, provider: feed("feeds:lobsters", () => createLobstersProvider(config.lobsters)) },
    { id: "feeds:openalex", enabled: config.providers.openAlex.enabled, provider: feed("feeds:openalex", () => createOpenAlexProvider(config.openAlex)) },
    { id: "feeds:rss", enabled: config.providers.rss.enabled, provider: feed("feeds:rss", () => createRssProvider(config.rss)) },
  ];
}

async function gather(
  persona: Persona,
  settings: Awaited<ReturnType<typeof readSettings>>,
  sandbox: boolean,
  recorder: Recorder,
  onProgress?: ProgressSink,
): Promise<{ results: SearchResult[]; reports: ProviderReport[] }> {
  const query = queryFor(persona, keywordsFor(persona, settings.radar.keywordOverrides));
  const results: SearchResult[] = [];
  const reports: ProviderReport[] = [];
  const outcomes = await Promise.all((await providerEntries(sandbox, settings)).map(async (entry) => {
    const started = Date.now();
    if (!entry.enabled || !entry.provider) {
      const report: ProviderReport = { id: entry.id, status: "disabled", resultCount: 0, message: "Disabled in Settings." };
      return { report, found: [] as SearchResult[], latencyMs: Date.now() - started };
    }
    const unavailable = entry.provider.unavailableReason();
    if (unavailable) {
      const report: ProviderReport = { id: entry.id, status: "degraded", resultCount: 0, message: unavailable };
      return { report, found: [] as SearchResult[], latencyMs: Date.now() - started };
    }
    try {
      const detailed = entry.detailedSearch ? await entry.detailedSearch(query) : null;
      const found = detailed?.results ?? await entry.provider.search(query, { limit: PROVIDER_LIMIT });
      // Sandbox's generic search fixture stands in for native search, but its
      // provenance is still native at the Radar boundary.
      const normalized = entry.id === "native-model-search"
        ? found.map((item) => ({ ...item, providerId: "native-model-search" }))
        : found;
      const report: ProviderReport = { id: entry.id, status: "ok", resultCount: normalized.length, message: `${normalized.length} result${normalized.length === 1 ? "" : "s"}.` };
      return { report, found: normalized, latencyMs: Date.now() - started, usage: detailed ?? undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(`${entry.id} degraded: ${message}`);
      const report: ProviderReport = { id: entry.id, status: "degraded", resultCount: 0, message };
      return { report, found: [] as SearchResult[], latencyMs: Date.now() - started };
    }
  }));

  // Network providers run together; persistence and progress remain ordered so
  // a slow source cannot corrupt the single run record or regress UI counts.
  for (const outcome of outcomes) {
    results.push(...outcome.found);
    reports.push(outcome.report);
    await recordProvider(recorder, outcome.report, outcome.latencyMs, outcome.usage);
    await onProgress?.({ phase: "provider", report: outcome.report });
  }
  return { results, reports };
}

async function evergreenIdeas(persona: Persona, recorder: Recorder): Promise<RadarCandidate[]> {
  const enabledPillars = persona.pillars.filter((pillar) => pillar.enabled);
  const prompt = [
    "Generate evergreen topic ideas for this persona. Topics and researched angles only; never write post text.",
    `Identity: ${persona.identityStatement}`,
    `Pillars: ${JSON.stringify(enabledPillars.map((p) => ({ id: p.id, name: p.name, subtopics: p.subtopics })))}`,
    `Beliefs: ${JSON.stringify(persona.beliefs.filter((belief) => belief.enabled).map((belief) => belief.statement))}`,
    'Return JSON: {"ideas":[{"title":"...","summary":"...","angle":"...","pillarId":"..."|null}]}',
  ].join("\n\n");
  try {
    const output = await runStage({
      stage: "radar-evergreen", tier: "fast", prompt, schema: EvergreenOutputSchema,
      schemaName: "RadarEvergreenIdeas", maxTokens: 1400, temperature: 0.6, recorder,
    });
    return output.data.ideas.map((idea) => ({
      key: `evergreen:${normalisedTitle(idea.title)}`, title: idea.title, summary: idea.summary,
      angle: idea.angle, fitReason: "", pillarId: idea.pillarId, kind: "evergreen", sourceResults: [],
    }));
  } catch (error) {
    log.warn(`evergreen generation degraded: ${(error as Error).message}`);
    // A degraded model must not turn a scan into a failure. These are prompts
    // for angles, not generated post text.
    return enabledPillars.slice(0, 6).map((pillar) => ({
      key: `evergreen:${pillar.id}`, title: `What ${pillar.name.toLowerCase()} gets wrong in practice`,
      summary: pillar.description, angle: `Use one concrete trade-off from ${pillar.name}, not a trend recap.`,
      fitReason: `This sits directly inside your ${pillar.name} pillar.`, pillarId: pillar.id,
      kind: "evergreen" as const, sourceResults: [],
    }));
  }
}

async function freeNovelty(candidate: RadarCandidate, history: Awaited<ReturnType<typeof contentHistory>>): Promise<number> {
  const result = await createSimilarityService().compare(
    { id: "", topic: candidate.title, thesis: candidate.angle || candidate.summary, text: `${candidate.title}\n${candidate.summary}\n${candidate.angle}` },
    history.map((item) => ({ id: item.id, topic: item.angle, thesis: item.thesis, text: item.text, vectors: item.similarity ?? undefined })),
  );
  return noveltyFromMatches(result.matches);
}

async function fastAssess(candidates: RadarCandidate[], persona: Persona, keywords: string[], recorder: Recorder) {
  const prompt = [
    "Score topic fit. Do not write posts. Return integer scores only.",
    `Persona: ${persona.identityStatement}`,
    `Pillars: ${JSON.stringify(persona.pillars.filter((p) => p.enabled).map((p) => ({ id: p.id, name: p.name, subtopics: p.subtopics })))}`,
    `Beliefs: ${JSON.stringify(persona.beliefs.filter((b) => b.enabled).map((b) => b.statement))}`,
    `Candidates: ${JSON.stringify(candidates.map((c) => ({ key: c.key, title: c.title, summary: c.summary })))}`,
    "claimRisk is inverted: 100 means low unverifiable-claim risk; 0 means high risk.",
    'Return {"assessments":[{"key":"...","personaRelevance":0,"claimRisk":0,"pillarId":null,"fitReason":"Fits because ..."}]}.',
  ].join("\n\n");
  try {
    return (await runStage({
      stage: "radar-fast-score", tier: "fast", prompt, schema: FastAssessmentSchema,
      schemaName: "RadarFastAssessment", maxTokens: 2200, temperature: 0.2, recorder,
    })).data.assessments;
  } catch (error) {
    log.warn(`fast scoring degraded: ${(error as Error).message}`);
    return candidates.map((candidate) => ({
      key: candidate.key,
      personaRelevance: heuristicPersonaRelevance(`${candidate.title} ${candidate.summary}`, keywords),
      claimRisk: candidate.kind === "evergreen" ? 85 : 65,
      pillarId: candidate.pillarId,
      fitReason: candidate.fitReason || "It overlaps with the subjects and beliefs in your persona.",
    }));
  }
}

async function strongAssess(candidates: RadarCandidate[], recorder: Recorder) {
  if (candidates.length === 0) return [];
  const prompt = [
    "Judge usefulness and angle strength for these topic candidates. Produce topics and angles only; never post copy.",
    `Candidates: ${JSON.stringify(candidates.map((c) => ({ key: c.key, title: c.title, summary: c.summary, sources: c.sourceResults.map((s) => s.domain) })))}`,
    'Return {"assessments":[{"key":"...","usefulness":0,"angleStrength":0,"angle":"one non-obvious angle"}]}.',
  ].join("\n\n");
  try {
    return (await runStage({
      stage: "radar-strong-score", tier: "strong", prompt, schema: StrongAssessmentSchema,
      schemaName: "RadarStrongAssessment", maxTokens: 1400, temperature: 0.25, recorder,
    })).data.assessments;
  } catch (error) {
    log.warn(`strong scoring degraded: ${(error as Error).message}`);
    return candidates.map((candidate) => ({
      key: candidate.key, usefulness: 60, angleStrength: candidate.angle ? 65 : 55,
      angle: candidate.angle || `Explain the practical trade-off behind ${candidate.title}.`,
    }));
  }
}

async function storeCandidateSources(topicId: string, results: SearchResult[]): Promise<Source[]> {
  const existing = await sourcesForTopic(topicId);
  const byUrl = new Map(existing.map((source) => [source.url, source]));
  const taken = new Set(existing.map((source) => source.id));
  const stored = [...existing];
  for (const item of results) {
    if (byUrl.has(item.url)) continue;
    const id = sourceIdFor(item.url, taken);
    taken.add(id);
    const source = await sourceStore.put({
      id, topicId, title: item.title, url: item.url, domain: item.domain || domainOf(item.url),
      publishedAt: item.publishedAt, retrievedAt: item.retrievedAt, excerpt: item.snippet,
      sourceQuality: classifyQuality(item.url), providerId: item.providerId,
    });
    stored.push(source);
    byUrl.set(source.url, source);
  }
  return stored;
}

async function expireBank(now: Date): Promise<void> {
  for (const topic of await topicStore.list()) {
    const expired = expireBankedTopic(topic, now);
    if (expired.status !== topic.status) await topicStore.put(expired);
  }
}

function updateProviderSettings(settings: Awaited<ReturnType<typeof readSettings>>, reports: ProviderReport[]) {
  const keyById = {
    "native-model-search": "nativeModelSearch", "feeds:hacker-news": "hackerNews", "feeds:reddit": "reddit",
    "feeds:arxiv": "arxiv", "feeds:github": "github", "feeds:dev-community": "devCommunity",
    "feeds:lobsters": "lobsters", "feeds:openalex": "openAlex", "feeds:rss": "rss",
  } as const;
  const providers = { ...settings.radar.providers };
  const now = new Date().toISOString();
  for (const report of reports) {
    const key = keyById[report.id as keyof typeof keyById];
    if (!key) continue;
    providers[key] = {
      ...providers[key], lastRunAt: now, lastStatus: report.status, lastResultCount: report.resultCount, lastMessage: report.message,
    };
  }
  return { ...settings, radar: { ...settings.radar, providers } };
}

export interface RadarScanExecution {
  /** Today supplies its recorder so the complete daily loop is one inspectable run. */
  recorder?: Recorder;
  /** Optional cadence-aware replacement for the slice-4 history heuristic. */
  diversityContribution?: (pillarId: string | null) => number;
}

export async function runRadarScan(
  idempotencyKey: string | null = null,
  onProgress?: ProgressSink,
  execution: RadarScanExecution = {},
): Promise<RadarScanResult> {
  const [persona, settings, resolved] = await Promise.all([readPersonaOrEmpty(), readSettings(), getProvider()]);
  const ownsRecorder = !execution.recorder;
  const recorder = execution.recorder ?? await startRun({ kind: "radar", personaVersion: persona.activeVersion, sandbox: resolved.sandbox, idempotencyKey });
  const now = new Date();
  try {
    await expireBank(now);
    const gathered = await gather(persona, settings, resolved.sandbox, recorder, onProgress);
    const fresh = deduplicateResults(gathered.results).map<RadarCandidate>((candidate) => ({
      key: candidate.key, title: candidate.title, summary: candidate.summary, angle: "", fitReason: "",
      pillarId: null, kind: "fresh", sourceResults: candidate.sources,
    }));
    const history = await contentHistory();
    const existing = await topicStore.list();
    const dismissed = new Set(existing.filter((topic) => topic.status === "dismissed").map((topic) => normalisedTitle(topic.title)));
    const existingByTitle = new Map(existing.filter((topic) => topic.status === "banked" || topic.status === "ready").map((topic) => [normalisedTitle(topic.title), topic]));
    // Fresh feed candidates pass the two free similarity layers before the
    // first model call of the scan. Evergreen ideas necessarily have to exist
    // before they can be checked, so they take the same free path immediately
    // after their one generation call.
    await onProgress?.({ phase: "stage", stage: "novelty", detail: `${fresh.length} fresh candidates` });
    const novelty = new Map<string, number>();
    let rejectedSimilar = 0;
    const novel: RadarCandidate[] = [];
    const checkNovelty = async (candidates: RadarCandidate[]) => {
      for (const candidate of candidates) {
        if (dismissed.has(normalisedTitle(candidate.title))) continue;
        const score = await freeNovelty(candidate, history);
        novelty.set(candidate.key, score);
        if (score < settings.radar.noveltyFloor) rejectedSimilar += 1;
        else novel.push(candidate);
      }
    };
    await checkNovelty(fresh);
    const evergreen = await evergreenIdeas(persona, recorder);
    await checkNovelty(evergreen);
    const all = [...fresh, ...evergreen];
    await recorder.record({
      stage: "novelty:L1+L2", model: "none", prompt: "", rawResponse: "",
      parsed: { considered: all.length, survived: novel.length, rejectedSimilar, modelCalls: 0 },
      latencyMs: 0, tokensIn: 0, tokensOut: 0,
    });

    const keywords = keywordsFor(persona, settings.radar.keywordOverrides);
    await onProgress?.({ phase: "stage", stage: "fast", detail: `${novel.length} survivors` });
    const fast = await fastAssess(novel, persona, keywords, recorder);
    const fastByKey = new Map(fast.map((item) => [item.key, item]));
    for (const candidate of novel) {
      const assessment = fastByKey.get(candidate.key);
      candidate.pillarId = assessment?.pillarId ?? candidate.pillarId ?? pillarFor(candidate, persona.pillars);
      candidate.fitReason = assessment?.fitReason ?? candidate.fitReason;
    }
    const cheapRanked = [...novel].sort((a, b) => {
      const as = (fastByKey.get(a.key)?.personaRelevance ?? 0) + (novelty.get(a.key) ?? 0);
      const bs = (fastByKey.get(b.key)?.personaRelevance ?? 0) + (novelty.get(b.key) ?? 0);
      return bs - as;
    });
    await onProgress?.({ phase: "stage", stage: "strong", detail: `${Math.min(5, cheapRanked.length)} finalists` });
    const strong = await strongAssess(cheapRanked.slice(0, 5), recorder);
    const strongByKey = new Map(strong.map((item) => [item.key, item]));
    const recentPillars = existing.filter((topic) => topic.status === "used").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20).map((topic) => topic.pillarId);
    const scored = novel.map((candidate) => {
      const fastItem = fastByKey.get(candidate.key);
      const strongItem = strongByKey.get(candidate.key);
      const qualities = candidate.sourceResults.map((source) => classifyQuality(source.url));
      const components: RadarScoreComponents = {
        personaRelevance: fastItem?.personaRelevance ?? heuristicPersonaRelevance(`${candidate.title} ${candidate.summary}`, keywords),
        novelty: novelty.get(candidate.key) ?? 100,
        freshness: candidate.kind === "evergreen" ? 0 : freshnessScore(candidate.sourceResults, now.getTime()),
        sourceQuality: candidate.kind === "evergreen" ? 70 : sourceQualityScore(qualities, candidate.sourceResults.map((source) => source.domain)),
        usefulness: strongItem?.usefulness ?? 55,
        angleStrength: strongItem?.angleStrength ?? (candidate.angle ? 60 : 45),
        claimRisk: fastItem?.claimRisk ?? (candidate.kind === "evergreen" ? 85 : 60),
        diversityContribution: execution.diversityContribution?.(candidate.pillarId)
          ?? diversityScore(candidate.pillarId, recentPillars),
      };
      const total = weightedScore(components, settings.radar.weights, candidate.kind === "evergreen" ? ["freshness"] : []);
      return { candidate: { ...candidate, angle: strongItem?.angle || candidate.angle }, components, total };
    }).sort((a, b) => b.total - a.total);

    await onProgress?.({ phase: "stage", stage: "bank", detail: `threshold ${settings.radar.qualityThreshold}` });
    const winners = scored.filter((item) => item.total >= settings.radar.qualityThreshold);
    const storedTopics: Topic[] = [];
    const storedSources: Source[] = [];
    for (const [index, item] of winners.entries()) {
      const candidate = item.candidate;
      const priorBanked = existingByTitle.get(normalisedTitle(candidate.title));
      const timestamp = now.toISOString();
      let topic: Topic = {
        id: priorBanked?.id ?? newId(), title: candidate.title, summary: candidate.summary,
        sourceType: candidate.kind === "seed" ? "seed" : "radar", pillarId: candidate.pillarId,
        freshness: candidate.kind === "evergreen" ? "evergreen" : "current",
        status: index < 3 ? "ready" : "banked", context: candidate.sourceResults.map((source) => source.url).join("\n"),
        scoreComponents: item.components, scoreTotal: item.total, scoreLabel: scoreLabel(item.total),
        radarKind: candidate.kind, angle: candidate.angle, fitReason: candidate.fitReason,
        bankedAt: priorBanked?.bankedAt ?? null, bankedUntil: priorBanked?.bankedUntil ?? null,
        dismissedAt: null, createdAt: priorBanked?.createdAt ?? timestamp, updatedAt: timestamp,
      };
      if (index >= 3) topic = bankTopic(topic, settings.radar.bankDecayHours, now);
      topic = await topicStore.put(topic);
      storedTopics.push(topic);
      storedSources.push(...await storeCandidateSources(topic.id, candidate.sourceResults));
    }
    const rejectedWeak = scored.length - winners.length;
    const recommendation = winners.length > 0 ? "topics" as const : "skip" as const;
    const reason = winners.length > 0
      ? `I found ${winners.length} topic${winners.length === 1 ? "" : "s"} worth considering after checking ${all.length}.`
      : `I looked at ${all.length} thing${all.length === 1 ? "" : "s"}. ${rejectedSimilar} were too close to things you already covered. The rest did not clear your quality threshold.`;
    await recorder.record({
      stage: "threshold-and-bank", model: "none", prompt: "", rawResponse: "",
      parsed: { recommendation, consideredCount: all.length, rejectedFor: { similar: rejectedSimilar, weak: rejectedWeak }, stored: storedTopics.length },
      latencyMs: 0, tokensIn: 0, tokensOut: 0,
    });
    await writeSettings(updateProviderSettings(settings, gathered.reports));
    if (ownsRecorder) await recorder.finish("done");
    return {
      recommendation, reason, consideredCount: all.length,
      rejectedFor: { similar: rejectedSimilar, weak: rejectedWeak }, topics: storedTopics,
      sources: storedSources, providers: gathered.reports, runId: recorder.id,
    };
  } catch (error) {
    await recorder.recordFailure("radar-scan", "none", "", error);
    if (ownsRecorder) await recorder.finish("failed");
    throw error;
  }
}

export async function testRadarProviders(): Promise<{ providers: ProviderReport[]; runId: string }> {
  const [persona, settings, resolved] = await Promise.all([readPersonaOrEmpty(), readSettings(), getProvider()]);
  const recorder = await startRun({
    kind: "radar", personaVersion: persona.activeVersion, sandbox: resolved.sandbox,
    idempotencyKey: `radar-provider-test-${Date.now()}`,
  });
  try {
    const gathered = await gather(persona, settings, resolved.sandbox, recorder);
    await writeSettings(updateProviderSettings(settings, gathered.reports));
    await recorder.finish("done");
    return { providers: gathered.reports, runId: recorder.id };
  } catch (error) {
    await recorder.recordFailure("provider-test", "none", "", error);
    await recorder.finish("failed");
    throw error;
  }
}
