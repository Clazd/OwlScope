import type { Deviation } from "@/domain/persona/fingerprint";
import { X_LIMIT } from "./text";
import type {
  CritiqueRecord,
  GateFinding,
  GateReport,
  Sentence,
  SimilarityResult,
  ValidationOutput,
} from "./schema";

/**
 * The quality gates. Pure, so they run on every render and in every test.
 *
 * Blocking findings stop finalisation outright. Warnings never do - they are
 * information, and a product that blocks on "the opening is weak" is a product
 * that teaches its user to click through blocks.
 */

const FINGERPRINT_WARN_BELOW = 60;
const TOO_MANY_FACTS = 4;
const LONG_POST = Math.round(X_LIMIT * 0.9);

export interface GateInput {
  sentences: Sentence[];
  characterCount: number;
  validation: ValidationOutput | null;
  critique: CritiqueRecord | null;
  similarity: SimilarityResult | null;
  fingerprintScore: number;
  /** False when no fingerprint exists. The score gate then has nothing to say. */
  fingerprintScored: boolean;
  fingerprintDeviations: Deviation[];
  /** Set when the topic tripped a persona boundary. Always blocking. */
  boundaryBlocked: boolean;
  boundaryExplanation: string;
  /** True when research could not produce evidence for a current-events topic. */
  staleAsCurrent: boolean;
  /** An explicit, recorded override for the unsupported-claim gate. */
  overriddenSentenceIds: string[];
}

function finding(
  id: string,
  blocking: boolean,
  message: string,
  sentenceId: string | null = null,
): GateFinding {
  return { id, blocking, message, sentenceId };
}

/**
 * Every gate in one pass.
 *
 * The unsupported-claim gate is the only one an override can clear, and the
 * override is per sentence: confirming one unsupported claim does not silently
 * clear the next one the writer produces.
 */
export function evaluateGates(input: GateInput): GateReport {
  const blocking: GateFinding[] = [];
  const warnings: GateFinding[] = [];

  if (input.boundaryBlocked) {
    blocking.push(
      finding("boundary", true, input.boundaryExplanation || "This topic touches a persona boundary."),
    );
  }

  // Unsupported factual claims. The validator's verdict wins over the writer's
  // self-assessment, because the writer has an interest in the answer.
  const verdicts = new Map(input.validation?.sentences.map((s) => [s.id, s]) ?? []);
  for (const sentence of input.sentences) {
    if (sentence.claimType !== "fact") continue;
    const support = verdicts.get(sentence.id)?.support ?? sentence.support;
    if (support !== "unsupported") continue;
    if (input.overriddenSentenceIds.includes(sentence.id)) {
      warnings.push(
        finding(
          `unsupported-override:${sentence.id}`,
          false,
          `Sentence ${sentence.id} is an unsupported factual claim, finalised under a recorded override.`,
          sentence.id,
        ),
      );
      continue;
    }
    blocking.push(
      finding(
        `unsupported:${sentence.id}`,
        true,
        `Sentence ${sentence.id} states a fact nothing retrieved supports. Remove it, qualify it, or override explicitly.`,
        sentence.id,
      ),
    );
  }

  for (const reason of input.validation?.blockingReasons ?? []) {
    blocking.push(finding(`validation:${reason.slice(0, 40)}`, true, reason));
  }

  // Similarity.
  if (input.similarity?.risk === "high") {
    const closest = input.similarity.matches[0];
    blocking.push(
      finding(
        "similarity-high",
        true,
        closest
          ? `Too close to a recent post: ${closest.note || `${Math.round(closest.score * 100)}% overlap`}.`
          : "Too close to a recent post.",
      ),
    );
  } else if (input.similarity?.risk === "medium") {
    warnings.push(finding("similarity-medium", false, "Some overlap with a recent post. Worth a look."));
  }

  if (input.critique) {
    if (input.critique.recommendation === "reject") {
      blocking.push(finding("critic-reject", true, "The critic recommends rejecting this draft."));
    }
    for (const issue of input.critique.issues) {
      const id = `critique:${issue.type}:${issue.sentenceId ?? "post"}`;
      const message = issue.suggestion ? `${issue.detail} - ${issue.suggestion}` : issue.detail;
      if (issue.severity === "block") blocking.push(finding(id, true, message, issue.sentenceId));
      else if (issue.severity === "warn") warnings.push(finding(id, false, message, issue.sentenceId));
    }
    if (input.critique.personaFit === "weak") {
      blocking.push(finding("persona-fit", true, "The voice is materially inconsistent with the persona."));
    }
    if (input.critique.genericness === "high") {
      warnings.push(finding("generic", false, "The critic reads this as generic."));
    }
  }

  // A major mechanical deviation is a voice problem the critic did not have to
  // notice - it is measured, not judged, so it stands on its own.
  const majors = input.fingerprintDeviations.filter((d) => d.severity === "major");
  if (majors.length >= 3) {
    blocking.push(
      finding("fingerprint-major", true, `Voice is off in ${majors.length} measured ways: ${majors[0]?.message}`),
    );
  } else if (input.fingerprintScored && input.fingerprintScore < FINGERPRINT_WARN_BELOW) {
    warnings.push(finding("fingerprint-low", false, `Fingerprint score is ${input.fingerprintScore}, below 60.`));
  }

  if (input.staleAsCurrent) {
    blocking.push(
      finding(
        "stale",
        true,
        "This is a current-events topic and research could not confirm anything current. It cannot ship as current.",
      ),
    );
  }

  if (input.characterCount > X_LIMIT) {
    blocking.push(finding("over-limit", true, `${input.characterCount} characters, past the ${X_LIMIT} limit.`));
  } else if (input.characterCount > LONG_POST) {
    warnings.push(finding("long", false, `${input.characterCount} characters. Long for this writer.`));
  }

  const factCount = input.sentences.filter((s) => s.claimType === "fact").length;
  if (factCount > TOO_MANY_FACTS) {
    warnings.push(finding("fact-density", false, `${factCount} factual claims in one post. Each one is a liability.`));
  }

  const opening = input.sentences[0];
  if (opening && opening.claimType === "rhetorical" && opening.text.trim().endsWith("?")) {
    warnings.push(finding("weak-opening", false, "Opens with a rhetorical question.", opening.id));
  }

  return { canFinalise: blocking.length === 0, blocking, warnings };
}
