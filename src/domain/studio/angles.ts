import "server-only";
import type { ExperienceItem, Persona } from "@/domain/persona/schema";
import type { Recorder } from "@/services/runs/recorder";
import { assembleContext } from "./context";
import {
  memoryBlock,
  outputBlock,
  personaBlock,
  researchBlock,
  sourcesBlock,
  topicBlock,
  truthfulnessBlock,
} from "./prompts";
import {
  AnglePickSchema,
  AnglesOutputSchema,
  type Angle,
  type AnglePick,
  type ResearchRecord,
  type Source,
  type Topic,
} from "./schema";
import { runStage } from "./stage";

/**
 * Stage 3. Four to six meaningfully different angles on the same evidence.
 *
 * "Meaningfully different" is the whole job. Six rewordings of one thesis is
 * what a tweet generator produces; the value here is that the technical read
 * and the counterintuitive read genuinely disagree about what matters, and the
 * user picks which argument they want to make.
 */

const STAGE = "angles";
const PICK_STAGE = "angle-pick";

const OUTPUT_SHAPE = [
  "{",
  '  "angles": [{',
  '    "id":"a1", "kind":"technical"|"opinion"|"explanation"|"counterintuitive"|"question"|"product",',
  '    "thesis":"one sentence", "whyItFits":"…",',
  '    "evidenceNeeded":["…"], "noveltyRisk":"low"|"medium"|"high", "noveltyNote":"…"',
  "  }]",
  "}",
].join("\n");

export interface AnglesInput {
  topic: Topic;
  research: ResearchRecord;
  sources: Source[];
  persona: Persona;
  recentPosts: Array<{ text: string; createdAt: string }>;
  experience: ExperienceItem[];
  recorder: Recorder;
  fixtureCase?: string;
}

function buildPrompt(input: AnglesInput) {
  return assembleContext(STAGE, [
    {
      section: "instructions",
      text: [
        "You are choosing what argument is worth making about this topic.",
        "",
        "Produce 4 to 6 angles that genuinely differ in what they claim, not in how they word it.",
        "Cover a spread of kinds: technical, opinion, plain explanation, counterintuitive observation,",
        "question or discussion, product and design perspective. Skip any kind the evidence cannot carry.",
        "",
        truthfulnessBlock(),
        "",
        "For each angle:",
        "  thesis — one sentence stating what the post would argue. Not a headline.",
        "  whyItFits — why this writer, specifically, would make this argument.",
        "  evidenceNeeded — which claims it depends on. If the evidence is not above, say so here.",
        "  noveltyRisk — how close it is to the recent posts listed below, and noveltyNote saying which one.",
        "",
        "Do not write the post. Do not draft an opening line.",
      ].join("\n"),
    },
    { section: "persona", text: personaBlock(input.persona) },
    { section: "evidence", text: topicBlock(input.topic) },
    { section: "evidence", text: researchBlock(input.research) },
    { section: "evidence", text: sourcesBlock(input.sources) },
    { section: "memory", text: memoryBlock(input.recentPosts) },
    { section: "output", text: outputBlock("AnglesOutput", OUTPUT_SHAPE) },
  ]);
}

export async function runAngles(input: AnglesInput): Promise<Angle[]> {
  const { prompt, usage } = buildPrompt(input);
  const result = await runStage({
    stage: STAGE,
    tier: "strong",
    prompt,
    schema: AnglesOutputSchema,
    schemaName: "AnglesOutput",
    maxTokens: 1800,
    temperature: 0.9,
    recorder: input.recorder,
    usage,
    fixtureCase: input.fixtureCase,
  });

  // Ids are positional and rewritten here: a model that returns two `a1`s would
  // otherwise make selection ambiguous in a way the user could not see.
  return result.data.angles.slice(0, 6).map((angle, index) => ({ ...angle, id: `a${index + 1}` }));
}

/* ------------------------------------------------------------- AI picks -- */

const PICK_SHAPE = '{"angleId":"a2","reasoning":"first person, two or three sentences, plain language"}';

export interface AnglePickInput {
  angles: Angle[];
  persona: Persona;
  recentPosts: Array<{ text: string; createdAt: string }>;
  recorder: Recorder;
  fixtureCase?: string;
}

/**
 * The AI picks, and shows its work. Rule 7: every recommendation explains its
 * topic choice and its angle choice, in the user's language rather than as a
 * score the user has to interpret.
 */
export async function runAnglePick(input: AnglePickInput): Promise<AnglePick> {
  const { prompt, usage } = assembleContext(PICK_STAGE, [
    {
      section: "instructions",
      text: [
        "Choose which of these angles this writer should take, and explain why in first person.",
        "",
        "Weigh: what their recent posts already covered, which pillar this serves, how strong the",
        "evidence is for each, and whether the angle says something only they would say.",
        "",
        "Two or three sentences. No hedging, no restating the angle back.",
        "",
        "ANGLES",
        ...input.angles.map(
          (angle) =>
            `  ${angle.id} (${angle.kind}, novelty risk ${angle.noveltyRisk}): ${angle.thesis} — ${angle.whyItFits}`,
        ),
      ].join("\n"),
    },
    { section: "persona", text: personaBlock(input.persona) },
    { section: "memory", text: memoryBlock(input.recentPosts) },
    { section: "output", text: outputBlock("AnglePick", PICK_SHAPE) },
  ]);

  const result = await runStage({
    stage: PICK_STAGE,
    tier: "fast",
    prompt,
    schema: AnglePickSchema,
    schemaName: "AnglePick",
    maxTokens: 400,
    temperature: 0.4,
    recorder: input.recorder,
    usage,
    fixtureCase: input.fixtureCase,
  });

  // A pick that names an angle it was not offered is not a pick.
  const known = input.angles.find((angle) => angle.id === result.data.angleId);
  if (!known) {
    const fallback = input.angles[0];
    return {
      angleId: fallback?.id ?? "a1",
      reasoning: `${result.data.reasoning} (The model named an angle that was not on the list, so the first one is selected instead.)`,
    };
  }
  return result.data;
}
