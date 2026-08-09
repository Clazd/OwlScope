import "server-only";
import { z } from "zod";
import { createLogger } from "@/lib/logging/log";
import {
  L3_SHORTLIST,
  createSimilarityService,
  type SimilarityHistoryItem,
  type SimilarityInput,
} from "@/services/memory/similarity";
import type { Recorder } from "@/services/runs/recorder";
import {
  SimilarityJudgementSchema,
  type ContentItem,
  type SimilarityRecord,
  type SimilarityResult,
} from "./schema";
import { runStage } from "./stage";

const log = createLogger("studio/similarity");

const STAGE = "similarity";

/**
 * The similarity check as the pipeline uses it.
 *
 * Layers one and two are free and run against everything. Layer three is one
 * cheap model call, sees at most eight prior posts, and only runs when the free
 * layers found something worth a second opinion - never the whole history, and
 * never at all when the answer is already known.
 */

export interface SimilarityCheckInput {
  candidate: SimilarityInput;
  history: ContentItem[];
  /** Only needed by L3. The free layers make no call and record nothing. */
  recorder?: Recorder;
  /** False when only the free layers should run - a re-check, or a live check. */
  allowModel?: boolean;
  fixtureCase?: string;
}

function toHistoryItem(item: ContentItem): SimilarityHistoryItem {
  return {
    id: item.id,
    text: item.text,
    topic: item.angle,
    thesis: item.thesis,
    // Reuse the vectors stored when the item was written. This is why they are
    // stored at all: the check is O(history) and should not re-tokenise it.
    vectors: item.similarity ? { l1: item.similarity.l1, l2: item.similarity.l2 } : null,
  };
}

const JudgeShape = [
  "{",
  '  "matches": [{"contentId":"…","score":0.0,"note":"what specifically overlaps"}]',
  "}",
].join("\n");

export async function checkSimilarity(input: SimilarityCheckInput): Promise<SimilarityRecord> {
  const service = createSimilarityService();
  const history = input.history.map(toHistoryItem);

  const recorder = input.recorder;
  const result = await service.compare(input.candidate, history, {
    judge: input.allowModel === false || !recorder
      ? undefined
      : async (candidate, shortlist) => {
          const prompt = [
            "Decide whether a new post makes the same argument as any of these earlier posts.",
            "",
            "Same wording is not the question - the free layers already checked that.",
            "The question is whether a reader who saw the earlier post would learn anything new from this one.",
            "",
            "NEW POST",
            candidate.text,
            `Thesis: ${candidate.thesis}`,
            "",
            `EARLIER POSTS (${shortlist.length}, the closest by cheap measures)`,
            ...shortlist.map((prior) => `  [${prior.contentId}] ${prior.text}`),
            "",
            "Score 0 to 1: 0 unrelated, 0.5 adjacent, 1 the same argument in different words.",
            "Only list posts scoring 0.45 or above. Only use the ids above.",
            "",
            `Reply with JSON matching SimilarityJudgement.\n${JudgeShape}`,
            "No prose, no code fence.",
          ].join("\n");

          log.debug(`L3 comparing against ${shortlist.length} prior post(s)`);
          const judged = await runStage({
            stage: STAGE,
            // Triage work on the fast model. This is the routing the brief asks
            // for, and it is why the check can run on every draft.
            tier: "fast",
            prompt,
            schema: SimilarityJudgementSchema,
            schemaName: "SimilarityJudgement",
            maxTokens: 700,
            temperature: 0,
            recorder,
            fixtureCase: input.fixtureCase,
          });
          return judged.data;
        },
  });

  if (result.usedModel && result.comparedAgainst > L3_SHORTLIST) {
    log.debug(`L3 saw ${L3_SHORTLIST} of ${result.comparedAgainst} posts, as designed`);
  }

  const vectors = service.vectorise(input.candidate);
  return { ...vectors, result };
}

/**
 * Combines a fresh free-layer pass with an earlier one that included L3.
 *
 * The re-check at finalisation runs the cheap layers against a history that may
 * have moved, but deliberately does not pay for L3 again. Picking one result
 * over the other would lose something either way: the fresh pass knows about
 * posts published since, and the earlier one knows what a model thought about
 * the argument. So take both - every match, and the worse of the two risks.
 */
export function mergeSimilarity(fresh: SimilarityResult, earlier: SimilarityResult | null): SimilarityResult {
  if (!earlier) return fresh;
  const order = { low: 0, medium: 1, high: 2 } as const;
  const seen = new Set(fresh.matches.map((match) => `${match.layer}:${match.contentId}`));
  const matches = [
    ...fresh.matches,
    ...earlier.matches.filter((match) => !seen.has(`${match.layer}:${match.contentId}`)),
  ].sort((a, b) => b.score - a.score);

  return {
    risk: order[fresh.risk] >= order[earlier.risk] ? fresh.risk : earlier.risk,
    matches: matches.slice(0, 12),
    usedModel: fresh.usedModel || earlier.usedModel,
    comparedAgainst: Math.max(fresh.comparedAgainst, earlier.comparedAgainst),
  };
}

/** Exported for the tests, which pin the shape the judge is allowed to return. */
export const JudgementSchema: z.ZodType<z.infer<typeof SimilarityJudgementSchema>> = SimilarityJudgementSchema;
