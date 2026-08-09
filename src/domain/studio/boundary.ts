import "server-only";
import { z } from "zod";
import { createLogger } from "@/lib/logging/log";
import type { Boundary } from "@/domain/persona/schema";
import { getProvider } from "@/services/ai/provider";
import type { Recorder } from "@/services/runs/recorder";
import type { BoundaryCheck } from "./schema";

const log = createLogger("studio/boundary");

const STAGE = "boundary";

/**
 * Stage 1's gate. A topic that touches a persona boundary is blocked here, and
 * no writing call is ever made for it.
 *
 * This is rule 9 enforced structurally. A prompt line saying "refuse political
 * topics" is a request the model can drift past; a stage that returns before
 * the writer exists cannot be drifted past at all.
 *
 * Two passes, cheapest first. The keyword pass costs nothing and catches the
 * obvious cases. The classifier runs on the fast model and only when the
 * keyword pass found nothing - because "is this topic political" genuinely
 * needs judgement, and a keyword list pretending to have judgement is how you
 * block an article about the politics of software licensing.
 */

/** Words that put a topic squarely inside a stock boundary. */
const KEYWORDS: Record<string, string[]> = {
  politics: [
    "election", "elections", "senate", "congress", "parliament", "president",
    "prime minister", "republican", "democrat", "labour party", "vote", "voters",
    "ballot", "campaign trail", "impeachment", "referendum",
  ],
  religion: ["religion", "religious", "church", "mosque", "synagogue", "scripture", "theology", "prayer"],
  "celebrity-gossip": ["celebrity", "celebrities", "dating rumour", "dating rumor", "red carpet", "paparazzi", "breakup"],
  nsfw: ["pornography", "porn", "nsfw", "explicit sexual"],
  "financial-advice": [
    "should i buy", "should you buy", "price target", "investment advice",
    "buy the dip", "portfolio allocation", "financial advice",
  ],
  "medical-advice": ["diagnosis", "dosage", "prescribe", "medical advice", "treatment plan", "symptoms of"],
};

function normalise(text: string): string {
  return ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim()} `;
}

export interface MechanicalHit {
  boundaryId: string;
  value: string;
  matched: string;
}

/**
 * Pure, so the tests can pin it and it costs nothing to run on every topic.
 *
 * Custom boundaries match on their own text; the stock kinds match on their
 * keyword list. A custom boundary with a one-word value is a blunt instrument
 * by construction - that is the user's choice, made visible when it fires.
 */
export function checkBoundariesMechanically(text: string, boundaries: Boundary[]): MechanicalHit[] {
  const haystack = normalise(text);
  const hits: MechanicalHit[] = [];

  for (const boundary of boundaries) {
    if (!boundary.enabled) continue;
    const needles = boundary.kind === "custom" ? [boundary.value] : (KEYWORDS[boundary.kind] ?? [boundary.value]);
    for (const needle of needles) {
      const term = normalise(needle).trim();
      if (term.length < 3) continue;
      if (!haystack.includes(` ${term} `)) continue;
      hits.push({ boundaryId: boundary.id, value: boundary.value, matched: term });
      break;
    }
  }
  return hits;
}

const ClassifierSchema = z.object({
  blocked: z.boolean(),
  boundaryValues: z.array(z.string()),
  explanation: z.string(),
});

function buildPrompt(topic: string, summary: string, boundaries: Boundary[]): string {
  return [
    "Decide whether a topic falls inside a writer's stated no-go areas.",
    "",
    "This is a classification task. Do not write anything about the topic.",
    "",
    "NO-GO AREAS",
    ...boundaries.map((b) => `  ${b.value}`),
    "",
    "TOPIC",
    topic,
    summary ? `Summary: ${summary}` : "",
    "",
    "A topic is blocked only when writing about it would require taking a position inside a no-go area.",
    "A topic that merely mentions one in passing, or discusses it as a technical or business subject, is not blocked.",
    "For example, with politics as a no-go area: an election result is blocked; how a government procures software is not.",
    "",
    'Reply with JSON: {"blocked":true|false,"boundaryValues":["…"],"explanation":"one plain sentence"}',
  ]
    .filter(Boolean)
    .join("\n");
}

export interface BoundaryCheckInput {
  title: string;
  summary: string;
  boundaries: Boundary[];
  recorder?: Recorder;
}

export async function runBoundaryCheck(input: BoundaryCheckInput): Promise<BoundaryCheck> {
  const enabled = input.boundaries.filter((b) => b.enabled);
  if (enabled.length === 0) {
    return { blocked: false, boundaryIds: [], explanation: "No boundaries are set." };
  }

  const text = `${input.title} ${input.summary}`;
  const mechanical = checkBoundariesMechanically(text, enabled);
  if (mechanical.length > 0) {
    const names = mechanical.map((hit) => hit.value);
    log.info(`topic blocked by ${names.join(", ")}`);
    return {
      blocked: true,
      boundaryIds: mechanical.map((hit) => hit.boundaryId),
      explanation:
        `This topic sits inside ${listOf(names)}, which you have marked as off limits in Brain. ` +
        `Nothing was written and no model was asked to write it. Edit the topic, or turn that boundary off.`,
    };
  }

  // Nothing obvious. Ask the fast model, which is the routing the brief calls
  // for: classification is cheap work and does not need the strong model.
  const resolved = await getProvider();
  const prompt = buildPrompt(input.title, input.summary, enabled);

  try {
    const result = await resolved.provider.completeStructured({
      stage: STAGE,
      tier: "fast",
      prompt,
      schema: ClassifierSchema,
      schemaName: "BoundaryCheck",
      maxTokens: 400,
      temperature: 0,
    });

    await input.recorder?.record({
      stage: STAGE,
      model: result.model,
      prompt: result.prompt,
      rawResponse: result.text,
      parsed: result.data,
      latencyMs: result.latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    });

    if (!result.data.blocked) {
      return { blocked: false, boundaryIds: [], explanation: "" };
    }

    const matched = enabled.filter((b) =>
      result.data.boundaryValues.some((value) => value.toLowerCase() === b.value.toLowerCase()),
    );
    return {
      blocked: true,
      boundaryIds: matched.map((b) => b.id),
      explanation:
        `${result.data.explanation.trim() || "This topic sits inside one of your stated no-go areas."} ` +
        `Nothing was written. Edit the topic, or change the boundary in Brain.`,
    };
  } catch (err) {
    // A boundary check that cannot run must not become a boundary check that
    // passes. Failing closed costs the user one edit; failing open costs them
    // a post they said they never wanted to make.
    await input.recorder?.recordFailure(STAGE, resolved.models.fast, prompt, err);
    log.error(`boundary check failed: ${(err as Error).message}`);
    return {
      blocked: true,
      boundaryIds: [],
      explanation:
        `The boundary check could not run (${(err as Error).message}), so this topic is blocked rather than ` +
        `assumed safe. Fix the provider error and try again.`,
    };
  }
}

function listOf(values: string[]): string {
  if (values.length === 1) return values[0] as string;
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}
