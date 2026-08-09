import type {
  SimilarityJudgement,
  SimilarityMatch,
  SimilarityResult,
  SimilarityVectors,
} from "@/domain/studio/schema";

/**
 * "Memory before repetition", without an embedding API.
 *
 * Three layers, cheapest first, and no external call until layer three:
 *
 *   L1  stemmed token Jaccard over topic and thesis   free   obvious duplicates
 *   L2  character-trigram cosine over the whole post  free   reworded repeats
 *   L3  a fast model over the top survivors           1 call the same argument
 *
 * Layers one and two are pure functions and are exported so the tests can pin
 * them without a provider. If pgvector or a hosted embedding service is ever
 * added it becomes a fourth implementation behind `SimilarityService` and no
 * caller changes.
 */

/* ------------------------------------------------------------ tokenising -- */

const STOP_WORDS = new Set([
  "a", "about", "after", "all", "also", "an", "and", "any", "are", "as", "at", "be", "because",
  "been", "before", "being", "but", "by", "can", "could", "did", "do", "does", "for", "from",
  "get", "gets", "had", "has", "have", "he", "her", "him", "his", "how", "i", "if", "in", "into",
  "is", "it", "its", "just", "like", "make", "makes", "me", "more", "most", "much", "my", "no",
  "not", "now", "of", "on", "one", "only", "or", "other", "our", "out", "over", "own", "same",
  "she", "should", "so", "some", "such", "than", "that", "the", "their", "them", "then", "there",
  "these", "they", "this", "those", "through", "to", "too", "under", "up", "very", "was", "we",
  "were", "what", "when", "where", "which", "while", "who", "why", "will", "with", "would", "you",
  "your",
]);

/**
 * A deliberately small suffix stripper, not Porter.
 *
 * The job is to make "frameworks" and "framework" the same token so a reworded
 * repeat is caught. A full stemmer would also conflate words this corpus never
 * needs conflated, and would be a dependency to keep.
 */
export function stem(word: string): string {
  let out = word;
  for (const suffix of ["ations", "ation", "ingly", "edly", "ings", "ness", "ment", "ies", "ing", "ers", "er", "ed", "es", "ly", "s"]) {
    if (out.length > suffix.length + 2 && out.endsWith(suffix)) {
      out = out.slice(0, -suffix.length);
      if (suffix === "ies") out += "y";
      break;
    }
  }
  return out;
}

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .map(stem);
}

/* ------------------------------------------------------------------- L1 -- */

/** Jaccard overlap of stemmed content tokens. 0 unrelated, 1 identical. */
export function jaccard(a: ReadonlyArray<string>, b: ReadonlyArray<string>): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/* ------------------------------------------------------------------- L2 -- */

export type Trigrams = Record<string, number>;

/**
 * Character trigrams over normalised text. Character-level rather than word
 * level because that is what survives a rewrite: "context windows are not
 * memory" and "context windows aren't memory" share almost every trigram and
 * only about half their word tokens.
 */
export function trigramsOf(text: string): { trigrams: Trigrams; norm: number } {
  const normalised = ` ${text.toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
  const counts: Trigrams = {};
  for (let i = 0; i + 3 <= normalised.length; i += 1) {
    const gram = normalised.slice(i, i + 3);
    counts[gram] = (counts[gram] ?? 0) + 1;
  }
  let sumSquares = 0;
  for (const value of Object.values(counts)) sumSquares += value * value;
  return { trigrams: counts, norm: Math.sqrt(sumSquares) };
}

export function cosine(a: Trigrams, aNorm: number, b: Trigrams, bNorm: number): number {
  if (aNorm === 0 || bNorm === 0) return 0;
  // Iterate the smaller map: the intersection is what the dot product needs.
  const [small, large] = Object.keys(a).length <= Object.keys(b).length ? [a, b] : [b, a];
  let dot = 0;
  for (const [gram, count] of Object.entries(small)) {
    const other = large[gram];
    if (other) dot += count * other;
  }
  return Math.min(1, dot / (aNorm * bNorm));
}

/** The first sentence, which is where a writer repeats themselves first. */
export function openingOf(text: string): string {
  const match = text.trim().match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (match?.[0] ?? text.trim().slice(0, 140)).trim();
}

/* --------------------------------------------------------------- service -- */

export interface SimilarityInput {
  /** Content id. Empty for a candidate that has not been saved yet. */
  id: string;
  text: string;
  topic: string;
  thesis: string;
}

export interface SimilarityHistoryItem extends SimilarityInput {
  /** Precomputed at write time. Recomputed here only if it is missing. */
  vectors?: SimilarityVectors | null;
}

export type SimilarityJudge = (
  candidate: SimilarityInput,
  shortlist: ReadonlyArray<{ contentId: string; text: string; thesis: string }>,
) => Promise<SimilarityJudgement>;

export interface CompareOptions {
  /** Absent means L3 does not run and the result is L1+L2 only. */
  judge?: SimilarityJudge;
}

export interface SimilarityService {
  vectorise(input: SimilarityInput): SimilarityVectors;
  compare(
    candidate: SimilarityInput,
    history: ReadonlyArray<SimilarityHistoryItem>,
    options?: CompareOptions,
  ): Promise<SimilarityResult>;
}

/** L3 never sees more than this many prior posts. Never the whole history. */
export const L3_SHORTLIST = 8;

const L1_HIGH = 0.6;
const L2_HIGH = 0.68;
const OPENING_HIGH = 0.8;
const MEDIUM = 0.4;
const L3_HIGH = 0.7;
const L3_MEDIUM = 0.45;
/**
 * How close a prior post must be on the free layers before it is worth asking a
 * model about. Below this the overlap is two posts sharing the word "because",
 * and paying for an opinion on that is the cheap-to-run rule broken.
 */
const L3_FLOOR = 0.2;

function riskOf(score: number, high: number, medium = MEDIUM): "low" | "medium" | "high" {
  if (score >= high) return "high";
  if (score >= medium) return "medium";
  return "low";
}

function worst(a: "low" | "medium" | "high", b: "low" | "medium" | "high"): "low" | "medium" | "high" {
  const order = { low: 0, medium: 1, high: 2 } as const;
  return order[a] >= order[b] ? a : b;
}

export function createSimilarityService(): SimilarityService {
  function vectorise(input: SimilarityInput): SimilarityVectors {
    const full = trigramsOf(input.text);
    const opening = trigramsOf(openingOf(input.text));
    return {
      l1: { tokens: [...new Set(tokenise(`${input.topic} ${input.thesis}`))].sort() },
      l2: {
        trigrams: full.trigrams,
        norm: full.norm,
        openingTrigrams: opening.trigrams,
        openingNorm: opening.norm,
      },
    };
  }

  async function compare(
    candidate: SimilarityInput,
    history: ReadonlyArray<SimilarityHistoryItem>,
    options: CompareOptions = {},
  ): Promise<SimilarityResult> {
    if (history.length === 0) {
      return { risk: "low", matches: [], usedModel: false, comparedAgainst: 0 };
    }

    const mine = vectorise(candidate);
    const matches: SimilarityMatch[] = [];
    let risk: "low" | "medium" | "high" = "low";

    // Both free layers run against everything. Scoring the whole history costs
    // nothing, so there is no reason to sample it.
    const scored = history.map((item) => {
      const theirs = item.vectors ?? vectorise(item);
      const l1 = jaccard(mine.l1.tokens, theirs.l1.tokens);
      const l2 = cosine(mine.l2.trigrams, mine.l2.norm, theirs.l2.trigrams, theirs.l2.norm);
      const opening = cosine(
        mine.l2.openingTrigrams,
        mine.l2.openingNorm,
        theirs.l2.openingTrigrams,
        theirs.l2.openingNorm,
      );
      return { item, l1, l2, opening, best: Math.max(l1, l2, opening) };
    });

    for (const entry of scored) {
      if (entry.l1 >= MEDIUM) {
        matches.push({
          contentId: entry.item.id,
          layer: "l1",
          score: entry.l1,
          note: `${Math.round(entry.l1 * 100)}% of the topic and thesis wording is shared.`,
        });
        risk = worst(risk, riskOf(entry.l1, L1_HIGH));
      }
      if (entry.l2 >= MEDIUM) {
        matches.push({
          contentId: entry.item.id,
          layer: "l2",
          score: entry.l2,
          note: `${Math.round(entry.l2 * 100)}% character overlap with the whole post.`,
        });
        risk = worst(risk, riskOf(entry.l2, L2_HIGH));
      }
      if (entry.opening >= OPENING_HIGH) {
        matches.push({
          contentId: entry.item.id,
          layer: "l2",
          score: entry.opening,
          note: "The opening sentence is close to one you have already used.",
        });
        risk = worst(risk, "high");
      }
    }

    // L3 only when there is something worth a model's opinion and a judge to
    // ask. An already-high result does not need confirming, and paying for a
    // call that cannot change the outcome is the cheap-to-run rule broken.
    const shortlist = scored
      .filter((entry) => entry.best >= L3_FLOOR)
      .sort((a, b) => b.best - a.best)
      .slice(0, L3_SHORTLIST);

    if (!options.judge || risk === "high" || shortlist.length === 0) {
      return { risk, matches: sortMatches(matches), usedModel: false, comparedAgainst: history.length };
    }

    const judgement = await options.judge(
      candidate,
      shortlist.map((entry) => ({
        contentId: entry.item.id,
        text: entry.item.text,
        thesis: entry.item.thesis,
      })),
    );

    const allowed = new Set(shortlist.map((entry) => entry.item.id));
    for (const match of judgement.matches) {
      // A model that names a post outside the shortlist has invented one.
      if (!allowed.has(match.contentId)) continue;
      if (match.score < L3_MEDIUM) continue;
      matches.push({ contentId: match.contentId, layer: "l3", score: match.score, note: match.note });
      risk = worst(risk, riskOf(match.score, L3_HIGH, L3_MEDIUM));
    }

    return { risk, matches: sortMatches(matches), usedModel: true, comparedAgainst: history.length };
  }

  return { vectorise, compare };
}

function sortMatches(matches: SimilarityMatch[]): SimilarityMatch[] {
  return [...matches].sort((a, b) => b.score - a.score).slice(0, 12);
}
