import "server-only";
import { createLogger } from "@/lib/logging/log";
import { getProvider } from "@/services/ai/provider";
import { classifyQuality, domainOf } from "@/services/search/extract";
import { createFixtureSearchProvider } from "@/services/search/fixture";
import { fetchPage } from "@/services/search/manual-url";
import { createNativeSearchProvider } from "@/services/search/native";
import type { SearchResult } from "@/services/search/provider";
import type { Recorder } from "@/services/runs/recorder";
import { assembleContext } from "./context";
import { outputBlock, sourcesBlock, topicBlock, truthfulnessBlock } from "./prompts";
import { ResearchOutputSchema, type ResearchRecord, type Source, type Topic } from "./schema";
import { sourceIdFor, sourceStore, sourcesForTopic } from "./store";
import { runStage } from "./stage";

const log = createLogger("studio/research");

const STAGE = "research";

/**
 * Stage 2. The researcher outputs verified facts, explicit uncertainties,
 * source records, candidate angles and a freshness read.
 *
 * It does not write the post. There is nowhere in its output schema to put one,
 * which is the enforcement - a prompt line asking it not to write would be a
 * suggestion, and this is not.
 *
 * The order matters: search first, store the sources, then reason. The model
 * never sees a URL it could cite before that URL is a stored source record, so
 * "cite by id" is checkable rather than hopeful.
 */

export interface ResearchInput {
  topic: Topic;
  /** URLs the user pasted. Fetched through the SSRF guard, never guessed at. */
  manualUrls?: string[];
  recorder: Recorder;
  /** Sandbox uses the fixture provider so research runs with no network at all. */
  fixtureCase?: string;
}

export interface ResearchResult {
  record: ResearchRecord;
  sources: Source[];
}

/* --------------------------------------------------------------- sources -- */

async function storeSources(topic: Topic, results: SearchResult[]): Promise<Source[]> {
  const existing = await sourcesForTopic(topic.id);
  const byUrl = new Map(existing.map((source) => [source.url, source]));
  const taken = new Set(existing.map((source) => source.id));
  const stored: Source[] = [];

  for (const result of results) {
    const already = byUrl.get(result.url);
    if (already) {
      stored.push(already);
      continue;
    }
    const id = sourceIdFor(result.url, taken);
    taken.add(id);
    const source: Source = {
      id,
      topicId: topic.id,
      title: result.title || result.url,
      url: result.url,
      domain: result.domain || domainOf(result.url),
      publishedAt: result.publishedAt,
      retrievedAt: result.retrievedAt,
      excerpt: result.snippet,
      sourceQuality: classifyQuality(result.url),
      providerId: result.providerId,
    };
    stored.push(await sourceStore.put(source));
  }
  return stored;
}

/* -------------------------------------------------------------- gathering -- */

interface Gathered {
  results: SearchResult[];
  droppedUrls: string[];
  /** Why each provider produced nothing, for the "research unavailable" state. */
  unavailable: string[];
  usedProviders: string[];
}

async function gather(input: ResearchInput): Promise<Gathered> {
  const resolved = await getProvider();
  const results: SearchResult[] = [];
  const droppedUrls: string[] = [];
  const unavailable: string[] = [];
  const usedProviders: string[] = [];

  // Pasted URLs first: the user chose them, so they outrank anything a search
  // turns up, and a failure to fetch one is worth reporting by name.
  for (const url of input.manualUrls ?? []) {
    try {
      const page = await fetchPage(url);
      results.push(page);
      if (!usedProviders.includes(page.providerId)) usedProviders.push(page.providerId);
    } catch (err) {
      unavailable.push(`${url}: ${(err as Error).message}`);
    }
  }

  if (resolved.sandbox) {
    // In sandbox the search half is a fixture too, so the whole stage - not
    // just the model call - runs with zero network.
    const provider = createFixtureSearchProvider();
    try {
      const found = await provider.search(input.topic.title, { fixtureCase: input.fixtureCase, limit: 6 });
      results.push(...found);
      if (found.length > 0) usedProviders.push(provider.id);
    } catch (err) {
      unavailable.push(`fixture search: ${(err as Error).message}`);
    }
    return { results, droppedUrls, unavailable, usedProviders };
  }

  const native = createNativeSearchProvider(resolved.provider);
  const reason = native.unavailableReason();
  if (reason) {
    unavailable.push(reason);
    return { results, droppedUrls, unavailable, usedProviders };
  }

  try {
    const outcome = await native.searchDetailed(input.topic.title, { limit: 6 });
    results.push(...outcome.results);
    droppedUrls.push(...outcome.droppedUrls);
    if (outcome.results.length > 0) usedProviders.push(native.id);

    await input.recorder.record({
      stage: "research-search",
      model: outcome.model,
      prompt: outcome.prompt,
      rawResponse: outcome.rawResponse,
      parsed: {
        searchCount: outcome.searchCount,
        returned: outcome.results.length,
        droppedUrls: outcome.droppedUrls,
      },
      latencyMs: outcome.latencyMs,
      tokensIn: outcome.tokensIn,
      tokensOut: outcome.tokensOut,
    });
  } catch (err) {
    unavailable.push(`web search: ${(err as Error).message}`);
    log.warn(`native search failed: ${(err as Error).message}`);
  }

  return { results, droppedUrls, unavailable, usedProviders };
}

/* ---------------------------------------------------------------- prompt -- */

const OUTPUT_SHAPE = [
  "{",
  '  "facts": [{"claim":"…","sourceIds":["src_…"],"kind":"from-source"|"inference"}],',
  '  "uncertainties": ["…"],',
  '  "freshness": {"assessment":"current"|"evergreen","note":"…"},',
  '  "insufficient": true|false,',
  '  "insufficientReason": "…"',
  "}",
].join("\n");

function buildPrompt(topic: Topic, sources: Source[]) {
  return assembleContext(STAGE, [
    {
      section: "instructions",
      text: [
        "You are the researcher. Establish what is true about this topic.",
        "",
        "You do not write posts. You do not propose wording. Another stage does that.",
        "",
        truthfulnessBlock(),
        "",
        "Rules specific to this stage:",
        "  - Every fact must cite the source ids that carry it.",
        '  - A conclusion you drew rather than read is kind "inference", and its sourceIds may be empty.',
        "  - Prefer primary and official sources. Say when a claim rests only on a forum or an aggregator.",
        "  - If a source does not state a publication date, do not assume the claim is current.",
        "  - Set insufficient to true when the evidence will not carry a factual post, and say why.",
      ].join("\n"),
    },
    { section: "evidence", text: topicBlock(topic) },
    { section: "evidence", text: sourcesBlock(sources) },
    { section: "output", text: outputBlock("ResearchOutput", OUTPUT_SHAPE) },
  ]);
}

/* ------------------------------------------------------------------- run -- */

export async function runResearch(input: ResearchInput): Promise<ResearchResult> {
  const gathered = await gather(input);
  const sources = await storeSources(input.topic, gathered.results);

  const noProviders = gathered.usedProviders.length === 0;

  // No evidence for a current-events topic is a reportable outcome, not a gap
  // to fill from model recall. The pipeline says so and stops.
  if (sources.length === 0) {
    const why = gathered.unavailable.length > 0 ? gathered.unavailable.join("; ") : "no provider returned any results";
    const record: ResearchRecord = {
      facts: [],
      uncertainties: [],
      freshness: { assessment: input.topic.freshness, note: "Nothing was retrieved, so freshness is unknown." },
      insufficient: true,
      insufficientReason:
        input.topic.freshness === "current"
          ? `Research is unavailable and this is a current-events topic (${why}). ` +
            `Nothing will be written as if there were evidence. Paste a URL, or change the topic to evergreen.`
          : `No sources were retrieved (${why}). An evergreen topic can still be written from your own beliefs, ` +
            `but no factual claim in it will be supported.`,
      sourceIds: [],
      droppedUrls: gathered.droppedUrls,
      noProviders,
      completedAt: new Date().toISOString(),
    };
    await input.recorder.record({
      stage: STAGE,
      model: "none",
      prompt: "",
      rawResponse: "",
      parsed: record,
      latencyMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      status: "skipped",
    });
    return { record, sources: [] };
  }

  const { prompt, usage } = buildPrompt(input.topic, sources);
  const result = await runStage({
    stage: STAGE,
    tier: "strong",
    prompt,
    schema: ResearchOutputSchema,
    schemaName: "ResearchOutput",
    maxTokens: 1600,
    temperature: 0.3,
    recorder: input.recorder,
    usage,
    fixtureCase: input.fixtureCase,
  });

  // A citation the model made up is dropped the same way an invented URL is.
  const known = new Set(sources.map((source) => source.id));
  const facts = result.data.facts.map((fact) => {
    const kept = fact.sourceIds.filter((id) => known.has(id));
    if (kept.length !== fact.sourceIds.length) {
      log.warn(`dropped unknown source id(s) on claim: ${fact.claim.slice(0, 60)}`);
    }
    return { ...fact, sourceIds: kept, kind: kept.length === 0 ? ("inference" as const) : fact.kind };
  });

  const record: ResearchRecord = {
    ...result.data,
    facts,
    sourceIds: sources.map((source) => source.id),
    droppedUrls: gathered.droppedUrls,
    noProviders,
    completedAt: new Date().toISOString(),
  };

  return { record, sources };
}
