import type { Frequency, Presence, Punctuation, Sample } from "./schema";

/**
 * Everything countable about a set of writing samples, computed in code.
 *
 * Models are bad at counting, so nothing here is ever asked of one. The model
 * receives these numbers as grounding for its qualitative read and returns only
 * the fields that genuinely need judgement.
 */

/* ------------------------------------------------------------- splitting -- */

/**
 * Sentence split on terminal punctuation and hard line breaks.
 *
 * Deliberately simple. It over-splits on "e.g." and under-splits on a missing
 * full stop, and both are fine: the output is a distribution over dozens of
 * posts, where a handful of miscounts move a percentile by nothing.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])[\s]+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function countWords(text: string): number {
  const words = text
    .replace(/https?:\/\/\S+/g, " url ")
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  return words.length;
}

/** Characters, which is the unit that matters on a platform with a limit. */
export function postLengthOf(text: string): number {
  return [...text.trim()].length;
}

/* ----------------------------------------------------------- percentiles -- */

/**
 * Linear interpolation between closest ranks - the same method as NumPy's
 * default, so a hand-check against any other tool agrees.
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0] as number;
  const rank = (p / 100) * (sortedValues.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const lowValue = sortedValues[low] as number;
  if (low === high) return lowValue;
  const highValue = sortedValues[high] as number;
  return round1(lowValue + (highValue - lowValue) * (rank - low));
}

export function median(values: number[]): number {
  return percentile([...values].sort((a, b) => a - b), 50);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/* ------------------------------------------------------------ occurrence -- */

const EMOJI = /\p{Extended_Pictographic}/u;
const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/u;
const EM_DASH = /\u2014|(?:\s--\s)/;
const SEMICOLON = /;/;
const ELLIPSIS = /\.\.\.|…/;
const LIST_MARKER = /(^|\n)\s*(?:[-*•]|\d+[.)])\s+/;

/**
 * Turns "how many of the samples contain this" into never / rare / common.
 *
 * The thresholds are deliberately blunt: under 5% is never (one stray post in
 * twenty is not a habit), under 35% is rare, above that is common.
 */
export function frequencyFrom(matches: number, total: number): Frequency {
  if (total === 0 || matches === 0) return "never";
  const share = matches / total;
  if (share < 0.05) return "never";
  if (share < 0.35) return "rare";
  return "common";
}

export function presenceFrom(matches: number, total: number): Presence {
  const frequency = frequencyFrom(matches, total);
  return frequency === "never" ? "none" : frequency;
}

function countMatching(texts: string[], pattern: RegExp): number {
  return texts.filter((t) => pattern.test(t)).length;
}

/* --------------------------------------------------------------- results -- */

export interface SampleStatistics {
  sentenceLength: { median: number; p10: number; p90: number };
  postLength: { median: number; p90: number };
  punctuation: Punctuation;
  emojiUse: Presence;
  hashtagUse: Presence;
  /** How many samples these numbers came from. */
  sampleCount: number;
  sentenceCount: number;
}

export function computeStatistics(texts: string[]): SampleStatistics {
  const sentenceWordCounts: number[] = [];
  const postLengths: number[] = [];

  for (const text of texts) {
    postLengths.push(postLengthOf(text));
    for (const sentence of splitSentences(text)) {
      const words = countWords(sentence);
      if (words > 0) sentenceWordCounts.push(words);
    }
  }

  const sortedSentences = [...sentenceWordCounts].sort((a, b) => a - b);
  const sortedPosts = [...postLengths].sort((a, b) => a - b);
  const total = texts.length;

  return {
    sentenceLength: {
      median: percentile(sortedSentences, 50),
      p10: percentile(sortedSentences, 10),
      p90: percentile(sortedSentences, 90),
    },
    postLength: {
      median: percentile(sortedPosts, 50),
      p90: percentile(sortedPosts, 90),
    },
    punctuation: {
      emDash: frequencyFrom(countMatching(texts, EM_DASH), total),
      semicolon: frequencyFrom(countMatching(texts, SEMICOLON), total),
      ellipsis: frequencyFrom(countMatching(texts, ELLIPSIS), total),
      listMarkers: frequencyFrom(countMatching(texts, LIST_MARKER), total),
    },
    emojiUse: presenceFrom(countMatching(texts, EMOJI), total),
    hashtagUse: presenceFrom(countMatching(texts, HASHTAG), total),
    sampleCount: total,
    sentenceCount: sentenceWordCounts.length,
  };
}

/**
 * Statistics come from the user's own posts.
 *
 * "Admired" samples are a cadence reference, but they are somebody else's
 * sentence lengths - letting them move the user's p90 would make the writer
 * chase a rhythm the user has never actually written in. They are used only
 * when there is nothing else to go on, and the UI says which set was used.
 */
export function statisticsFromSamples(samples: Sample[]): SampleStatistics & { basis: "mine" | "admired" | "none" } {
  const mine = samples.filter((s) => s.mode === "mine").map((s) => s.text);
  if (mine.length > 0) return { ...computeStatistics(mine), basis: "mine" };

  const admired = samples.filter((s) => s.mode === "admired").map((s) => s.text);
  if (admired.length > 0) return { ...computeStatistics(admired), basis: "admired" };

  return { ...computeStatistics([]), basis: "none" };
}

/** Buckets for the sentence-length histogram in Brain. */
export function sentenceHistogram(texts: string[], buckets = 14): number[] {
  const counts: number[] = [];
  for (const text of texts) {
    for (const sentence of splitSentences(text)) {
      const words = countWords(sentence);
      if (words > 0) counts.push(words);
    }
  }
  if (counts.length === 0) return new Array(buckets).fill(0);

  const max = Math.max(...counts);
  const bins = new Array<number>(buckets).fill(0);
  for (const count of counts) {
    const index = Math.min(buckets - 1, Math.floor(((count - 1) / max) * buckets));
    bins[index] = (bins[index] ?? 0) + 1;
  }
  return bins;
}
