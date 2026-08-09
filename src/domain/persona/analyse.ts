import "server-only";
import { z } from "zod";
import { getProvider } from "@/services/ai/provider";
import { categoriseError, startRun } from "@/services/runs/recorder";
import { QualitativeFingerprintSchema, type Fingerprint, type Sample } from "./schema";
import { statisticsFromSamples } from "./statistics";

/**
 * Fingerprint extraction: one call against the strong model.
 *
 * The model is asked only for what genuinely needs judgement. Everything
 * countable - sentence and post length, punctuation frequency, emoji and
 * hashtag use - is computed in code and handed to the model as grounding, so
 * its qualitative read is anchored to numbers it did not have to count.
 */

const STAGE = "fingerprint";

function renderSamples(samples: Sample[]): string {
  const mine = samples.filter((s) => s.mode === "mine");
  const admired = samples.filter((s) => s.mode === "admired");

  const blocks: string[] = [];
  if (mine.length > 0) {
    blocks.push(
      "POSTS THE USER WROTE - the source of their voice, vocabulary and opinions.",
      ...mine.map((s, i) => `[mine ${i + 1}]\n${s.text}`),
    );
  }
  if (admired.length > 0) {
    blocks.push(
      "",
      "POSTS BY OTHER PEOPLE THAT THE USER ADMIRES.",
      "Use these for cadence and structure ONLY. They are somebody else's writing:",
      "never take vocabulary, opinions or claims from them.",
      ...admired.map((s, i) => `[admired ${i + 1}]\n${s.text}`),
    );
  }
  return blocks.join("\n\n");
}

function buildPrompt(samples: Sample[], stats: ReturnType<typeof statisticsFromSamples>): string {
  return [
    "You are analysing a writer's style so a later stage can write in their voice.",
    "",
    "These measurements were computed from the samples in code. Treat them as fact and do not recompute or contradict them:",
    `  sentence length: median ${stats.sentenceLength.median} words, p10 ${stats.sentenceLength.p10}, p90 ${stats.sentenceLength.p90}`,
    `  post length: median ${stats.postLength.median} characters, p90 ${stats.postLength.p90}`,
    `  em dash ${stats.punctuation.emDash}, semicolon ${stats.punctuation.semicolon}, ellipsis ${stats.punctuation.ellipsis}, list markers ${stats.punctuation.listMarkers}`,
    `  emoji ${stats.emojiUse}, hashtags ${stats.hashtagUse}`,
    `  measured from ${stats.sampleCount} post(s) the user wrote, ${stats.sentenceCount} sentences`,
    "",
    renderSamples(samples),
    "",
    "Describe the qualitative side of this voice.",
    "  openingPatterns: how they actually begin posts, as 2-5 short descriptive labels.",
    "  avoidedOpenings: literal opening phrases that would read as wrong for this writer. Give the phrase itself, not a description. 3-6 of them.",
    "  capitalisation: one short sentence.",
    "  vocabulary.preferred: 5-12 words or phrases that recur and feel characteristic.",
    "  vocabulary.absent: 5-12 words this writer conspicuously never uses, especially hype vocabulary.",
    "  structuralHabits: 2-5 short labels for how posts are put together.",
    "",
    "Describe what is there. Do not flatter the writer and do not invent a signature they do not have.",
  ].join("\n");
}

export interface AnalyseResult {
  fingerprint: Fingerprint;
  runId: string;
  tokensIn: number;
  tokensOut: number;
  costEstimate: number;
  sandbox: boolean;
}

export async function analyseFingerprint(options: {
  samples: Sample[];
  personaVersion: number;
  idempotencyKey?: string | null;
}): Promise<AnalyseResult> {
  const { samples } = options;
  if (samples.length === 0) {
    throw new Error("There are no samples to analyse. Paste some posts first.");
  }

  const stats = statisticsFromSamples(samples);
  const prompt = buildPrompt(samples, stats);
  const resolved = await getProvider();

  const recorder = await startRun({
    kind: "fingerprint",
    personaVersion: options.personaVersion,
    sandbox: resolved.sandbox,
    idempotencyKey: options.idempotencyKey ?? null,
  });

  try {
    const result = await resolved.provider.completeStructured({
      stage: STAGE,
      tier: "strong",
      prompt,
      schema: QualitativeFingerprintSchema,
      schemaName: "VoiceFingerprint",
      maxTokens: 1500,
      temperature: 0.2,
    });

    await recorder.record({
      stage: STAGE,
      model: result.model,
      prompt: result.prompt,
      rawResponse: result.text,
      parsed: result.data,
      latencyMs: result.latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });
    const run = await recorder.finish("done");

    // Computed values win over anything the model says about them.
    const fingerprint: Fingerprint = {
      id: "fingerprint",
      sentenceLength: stats.sentenceLength,
      postLength: stats.postLength,
      punctuation: stats.punctuation,
      emojiUse: stats.emojiUse,
      hashtagUse: stats.hashtagUse,
      openingPatterns: result.data.openingPatterns,
      avoidedOpenings: result.data.avoidedOpenings,
      capitalisation: result.data.capitalisation,
      vocabulary: result.data.vocabulary,
      structuralHabits: result.data.structuralHabits,
      derivedFromCount: stats.sampleCount,
      editedByUser: false,
      createdAt: new Date().toISOString(),
    };

    return {
      fingerprint,
      runId: run.id,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costEstimate: result.costEstimate,
      sandbox: result.sandbox,
    };
  } catch (err) {
    await recorder.recordFailure(STAGE, resolved.models.strong, prompt, err);
    await recorder.finish("failed");
    throw err;
  }
}

/* ------------------------------------------------------------ test voice -- */

export const TestVoiceOutputSchema = z.object({
  posts: z.array(z.string().min(1)).min(2).max(3),
});

export { categoriseError };
