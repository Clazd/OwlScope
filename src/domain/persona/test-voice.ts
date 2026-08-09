import "server-only";
import { getProvider } from "@/services/ai/provider";
import { startRun } from "@/services/runs/recorder";
import { TestVoiceOutputSchema } from "./analyse";
import {
  getExperiencePromptBlock,
  getFingerprintPromptBlock,
  getPersonaPromptBlock,
  scoreAgainstFingerprint,
  type Deviation,
} from "./fingerprint";
import type { ExperienceItem, Fingerprint, Persona } from "./schema";

/**
 * Test voice: a topic in, two or three sample posts out.
 *
 * Nothing is saved to content history — this is a tuning surface, not a
 * publishing one. It is also the only way to validate slice 2 without slice 3,
 * so it uses the real prompt blocks the writer will use rather than a
 * simplified stand-in.
 */

const STAGE = "test-voice";

export interface VoiceSample {
  text: string;
  score: number;
  deviations: Deviation[];
}

export interface TestVoiceResult {
  samples: VoiceSample[];
  runId: string;
  tokensIn: number;
  tokensOut: number;
  costEstimate: number;
  sandbox: boolean;
}

export function buildTestVoicePrompt(
  topic: string,
  persona: Persona,
  fingerprint: Fingerprint | null,
  experience: ExperienceItem[],
): string {
  return [
    "Write sample posts as this writer, so they can check whether the voice is right.",
    "",
    getPersonaPromptBlock(persona),
    "",
    getFingerprintPromptBlock(fingerprint),
    "",
    getExperiencePromptBlock(experience),
    "",
    `TOPIC\n${topic}`,
    "",
    "Write 3 short posts on that topic, each taking a different angle.",
    "Obey every voice rule and every fingerprint constraint above.",
    "Do not invent statistics, sources, quotations or first-hand experience.",
    "No hashtags unless the fingerprint says hashtags are common. No engagement bait.",
  ].join("\n");
}

export async function runTestVoice(options: {
  topic: string;
  persona: Persona;
  fingerprint: Fingerprint | null;
  experience: ExperienceItem[];
  idempotencyKey?: string | null;
}): Promise<TestVoiceResult> {
  const { topic, persona, fingerprint, experience } = options;
  const prompt = buildTestVoicePrompt(topic, persona, fingerprint, experience);
  const resolved = await getProvider();

  const recorder = await startRun({
    kind: "test-voice",
    personaVersion: persona.activeVersion,
    sandbox: resolved.sandbox,
    idempotencyKey: options.idempotencyKey ?? null,
  });

  try {
    const result = await resolved.provider.completeStructured({
      stage: STAGE,
      tier: "strong",
      prompt,
      schema: TestVoiceOutputSchema,
      schemaName: "TestVoicePosts",
      maxTokens: 1200,
      temperature: 0.8,
    });

    // Scoring is mechanical and free, so every sample gets scored before it is
    // shown. The user sees the deviation, not just a number.
    const samples: VoiceSample[] = result.data.posts.map((text) => {
      const scored = scoreAgainstFingerprint(text, fingerprint);
      return { text, score: scored.score, deviations: scored.deviations };
    });

    await recorder.record({
      stage: STAGE,
      model: result.model,
      prompt: result.prompt,
      rawResponse: result.text,
      parsed: { posts: result.data.posts, scores: samples.map((s) => s.score) },
      latencyMs: result.latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });
    const run = await recorder.finish("done");

    return {
      samples,
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
