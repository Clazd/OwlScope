import "server-only";
import { scoreAgainstFingerprint } from "@/domain/persona/fingerprint";
import type { ExperienceItem, Fingerprint, Persona } from "@/domain/persona/schema";
import type { Recorder } from "@/services/runs/recorder";
import { assembleContext } from "./context";
import {
  deviationsBlock,
  experienceBlock,
  memoryBlock,
  outputBlock,
  personaBlock,
  sourcesBlock,
  truthfulnessBlock,
} from "./prompts";
import {
  CritiqueOutputSchema,
  type CritiqueRecord,
  type Sentence,
  type SimilarityResult,
  type Source,
  type ValidationOutput,
} from "./schema";
import { runStage } from "./stage";

/**
 * Stage 5b. The style critic reports and does not rewrite.
 *
 * There is nowhere in `CritiqueOutput` to put a rewritten post. That is the
 * enforcement — a critic that can hand back a "fixed" version becomes the
 * writer, and the writer stops being accountable for its own draft.
 *
 * It is fed the mechanical fingerprint deviations so it names specific broken
 * rules. A critic asked to judge voice from scratch produces "the tone feels
 * slightly off", which is not something anyone can act on.
 */

const STAGE = "critique";

const OUTPUT_SHAPE = [
  "{",
  '  "personaFit": "strong"|"acceptable"|"weak",',
  '  "genericness": "low"|"medium"|"high",',
  '  "factualRisk": "low"|"medium"|"high",',
  '  "issues": [{"sentenceId":"s2"|null,"severity":"block"|"warn"|"note","type":"cliche",',
  '              "detail":"…","suggestion":"…"}],',
  '  "recommendation": "accept"|"revise"|"reject"',
  "}",
].join("\n");

export interface CritiqueInput {
  text: string;
  sentences: Sentence[];
  sources: Source[];
  validation: ValidationOutput | null;
  similarity: SimilarityResult | null;
  persona: Persona;
  fingerprint: Fingerprint | null;
  experience: ExperienceItem[];
  recentPosts: Array<{ text: string; createdAt: string }>;
  recorder: Recorder;
  fixtureCase?: string;
}

function validationBlock(validation: ValidationOutput | null): string {
  if (!validation) return "FACT VALIDATION\nNot run yet.";
  return [
    "FACT VALIDATION — already decided. Do not re-litigate it; use it.",
    ...validation.sentences.map((verdict) => `  ${verdict.id}: ${verdict.support}. ${verdict.notes}`),
  ].join("\n");
}

function similarityBlock(similarity: SimilarityResult | null): string {
  if (!similarity) return "SIMILARITY\nNot checked.";
  if (similarity.matches.length === 0) {
    return `SIMILARITY\nRisk ${similarity.risk}. Nothing in the last ${similarity.comparedAgainst} posts overlaps.`;
  }
  return [
    `SIMILARITY — risk ${similarity.risk}, measured against ${similarity.comparedAgainst} prior posts.`,
    ...similarity.matches.slice(0, 5).map((match) => `  ${Math.round(match.score * 100)}%: ${match.note}`),
  ].join("\n");
}

function buildPrompt(input: CritiqueInput) {
  const scored = scoreAgainstFingerprint(input.text, input.fingerprint);

  return assembleContext(STAGE, [
    {
      section: "instructions",
      text: [
        "You are the critic. Judge this draft and report. You do not rewrite it.",
        "",
        "Do not return a corrected version, a suggested rewrite of the whole post, or an alternative opening.",
        "Per-sentence suggestions are fine and are the point of the suggestion field.",
        "",
        truthfulnessBlock(),
        "",
        "Evaluate: factual support, persona fit, repetition against recent posts, genericness, cliché use,",
        "fabricated experience, hype, clarity, opening strength, reader value, tone, claim certainty.",
        "",
        "Severity:",
        "  block — this cannot ship. Fabricated experience, a claim the validation marked unsupported,",
        "          a boundary problem, or a voice that is not this writer's.",
        "  warn  — worth fixing before posting. A weak opening, a cliché, a hedge that costs the point.",
        "  note  — an observation. No action required.",
        "",
        "Name the specific broken rule from the measured deviations below. Do not restate them as impressions.",
        'Do not invent a deviation that is not measured and is not visible in the text.',
        "",
        "THE DRAFT",
        ...input.sentences.map((sentence) => `  [${sentence.id}] (${sentence.claimType}) ${sentence.text}`),
      ].join("\n"),
    },
    { section: "persona", text: personaBlock(input.persona) },
    { section: "persona", text: deviationsBlock(scored.unscored ? 0 : scored.score, scored.deviations) },
    { section: "persona", text: experienceBlock(input.experience) },
    { section: "evidence", text: validationBlock(input.validation) },
    { section: "evidence", text: sourcesBlock(input.sources) },
    { section: "memory", text: similarityBlock(input.similarity) },
    { section: "memory", text: memoryBlock(input.recentPosts) },
    { section: "output", text: outputBlock("CritiqueOutput", OUTPUT_SHAPE) },
  ]);
}

export async function runCritique(input: CritiqueInput): Promise<CritiqueRecord> {
  const { prompt, usage } = buildPrompt(input);
  const result = await runStage({
    stage: STAGE,
    tier: "strong",
    prompt,
    schema: CritiqueOutputSchema,
    schemaName: "CritiqueOutput",
    maxTokens: 1600,
    temperature: 0.2,
    recorder: input.recorder,
    usage,
    fixtureCase: input.fixtureCase,
  });

  const known = new Set(input.sentences.map((sentence) => sentence.id));
  const scored = scoreAgainstFingerprint(input.text, input.fingerprint);

  return {
    ...result.data,
    // An issue pinned to a sentence that does not exist cannot be scrolled to,
    // so it becomes a whole-post issue rather than a dead link in the UI.
    issues: result.data.issues.map((issue) => ({
      ...issue,
      sentenceId: issue.sentenceId && known.has(issue.sentenceId) ? issue.sentenceId : null,
    })),
    // Both numbers are computed, not judged. The critic is not asked for them
    // because it would be guessing at something already measured.
    fingerprintScore: scored.unscored ? 0 : scored.score,
    similarityRisk: input.similarity?.risk ?? "low",
  };
}
