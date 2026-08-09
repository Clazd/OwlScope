import "server-only";
import type { Recorder } from "@/services/runs/recorder";
import { assembleContext } from "./context";
import { outputBlock, sourcesBlock, truthfulnessBlock } from "./prompts";
import { ValidationOutputSchema, type Sentence, type Source, type ValidationOutput } from "./schema";
import { runStage } from "./stage";

/**
 * Stage 5a. Fact validation, per sentence, against the stored sources.
 *
 * This is the payoff for storing drafts as sentence arrays. Asked to check a
 * wall of text, a model produces a paragraph of hedging. Asked "does source
 * src_2 carry sentence s1", it answers, and the answer is actionable.
 *
 * The validator never invents. It cannot add a source, cannot rewrite a
 * sentence, and cannot mark something supported by evidence that is not in
 * front of it - its output schema has room for a verdict and nothing else.
 */

const STAGE = "validate";

const OUTPUT_SHAPE = [
  "{",
  '  "sentences": [{"id":"s1","support":"supported"|"partial"|"unsupported","sourceIds":["src_…"],"notes":"…"}],',
  '  "canPublish": true|false,',
  '  "blockingReasons": ["…"]',
  "}",
].join("\n");

export interface ValidateInput {
  sentences: Sentence[];
  sources: Source[];
  recorder: Recorder;
  fixtureCase?: string;
}

function renderSentences(sentences: Sentence[]): string {
  return [
    "SENTENCES TO CHECK",
    ...sentences.map(
      (sentence) =>
        `  [${sentence.id}] (${sentence.claimType}${
          sentence.sourceIds.length > 0 ? `, writer cited ${sentence.sourceIds.join(", ")}` : ", writer cited nothing"
        }) ${sentence.text}`,
    ),
  ].join("\n");
}

function buildPrompt(input: ValidateInput) {
  return assembleContext(STAGE, [
    {
      section: "instructions",
      text: [
        "You are the fact validator. For each sentence, decide whether the listed sources support it.",
        "",
        "You do not rewrite. You do not suggest wording. You return verdicts.",
        "",
        truthfulnessBlock(),
        "",
        "Verdicts:",
        '  supported - a listed source states this. Name which in sourceIds.',
        '  partial - a source touches it but does not carry it as written (wrong scope, weaker claim, older).',
        '  unsupported - nothing listed states it, or it rests on a source that does not say it.',
        "",
        "Rules:",
        "  - Judge only against the sources below. Your own knowledge is not evidence here.",
        "  - The writer's own citation is a claim, not a fact. Check it.",
        '  - Judge opinion and rhetorical sentences as "supported" only if they state something checkable;',
        "    otherwise mark them supported with a note saying they assert nothing factual.",
        "  - notes is one short sentence saying what the source actually says, or what is missing.",
        "  - canPublish is false when any sentence stating a fact is unsupported.",
        "  - blockingReasons names those sentences in plain language. Empty when canPublish is true.",
      ].join("\n"),
    },
    { section: "evidence", text: renderSentences(input.sentences) },
    { section: "evidence", text: sourcesBlock(input.sources) },
    { section: "output", text: outputBlock("ValidationOutput", OUTPUT_SHAPE) },
  ]);
}

export async function runValidation(input: ValidateInput): Promise<ValidationOutput> {
  const { prompt, usage } = buildPrompt(input);
  const result = await runStage({
    stage: STAGE,
    tier: "fast",
    prompt,
    schema: ValidationOutputSchema,
    schemaName: "ValidationOutput",
    maxTokens: 1600,
    temperature: 0,
    recorder: input.recorder,
    usage,
    fixtureCase: input.fixtureCase,
  });

  const knownSentences = new Set(input.sentences.map((sentence) => sentence.id));
  const knownSources = new Set(input.sources.map((source) => source.id));

  const verdicts = result.data.sentences
    .filter((verdict) => knownSentences.has(verdict.id))
    .map((verdict) => ({
      ...verdict,
      // A validator that cites a source that does not exist has not validated
      // anything, so the citation goes and the verdict weakens with it.
      sourceIds: verdict.sourceIds.filter((id) => knownSources.has(id)),
    }))
    .map((verdict) =>
      verdict.support === "supported" && verdict.sourceIds.length === 0
        ? { ...verdict, support: "unsupported" as const, notes: `${verdict.notes} (No valid source was named.)`.trim() }
        : verdict,
    );

  // A sentence the validator skipped has not been checked, and unchecked is not
  // the same as fine. Fill the gap rather than letting it read as a pass.
  const seen = new Set(verdicts.map((verdict) => verdict.id));
  for (const sentence of input.sentences) {
    if (seen.has(sentence.id)) continue;
    verdicts.push({
      id: sentence.id,
      support: sentence.claimType === "fact" ? "unsupported" : "supported",
      sourceIds: [],
      notes: "The validator did not return a verdict for this sentence.",
    });
  }

  // canPublish is recomputed from the verdicts rather than taken on trust: it
  // is the field with the most to gain from being wrong.
  const byId = new Map(verdicts.map((verdict) => [verdict.id, verdict]));
  const failures = input.sentences.filter(
    (sentence) => sentence.claimType === "fact" && byId.get(sentence.id)?.support === "unsupported",
  );

  return {
    sentences: verdicts.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    canPublish: failures.length === 0,
    blockingReasons:
      failures.length === 0
        ? []
        : failures.map(
            (sentence) =>
              `${sentence.id} states a fact nothing retrieved supports: "${truncate(sentence.text)}"`,
          ),
  };
}

function truncate(text: string, limit = 90): string {
  return text.length <= limit ? text : `${text.slice(0, limit).trimEnd()}…`;
}
