/**
 * Similarity — stub in slice 1.
 *
 * "Memory before repetition" needs a way to ask whether a candidate has been
 * said before. The real implementation lands with Memory in a later slice and
 * will be local: no embedding API, no vector database.
 *
 * The one piece implemented now is the cheap lexical baseline, because it is
 * useful on its own and it gives the later work something to beat.
 */

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has",
  "he", "in", "is", "it", "its", "of", "on", "or", "that", "the", "they", "this",
  "to", "was", "were", "will", "with", "you", "your",
]);

export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/** Jaccard overlap of content words. 0 is unrelated, 1 is the same sentence. */
export function lexicalSimilarity(a: string, b: string): number {
  const left = new Set(tokenise(a));
  const right = new Set(tokenise(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export interface SimilarityMatch {
  id: string;
  score: number;
}

/** Placeholder ranking. Replaced, not extended, when Memory ships. */
export function rankBySimilarity(
  candidate: string,
  corpus: ReadonlyArray<{ id: string; text: string }>,
): SimilarityMatch[] {
  return corpus
    .map((entry) => ({ id: entry.id, score: lexicalSimilarity(candidate, entry.text) }))
    .sort((a, b) => b.score - a.score);
}
