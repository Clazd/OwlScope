import "server-only";
import type { Persona } from "@/domain/persona/schema";
import { createLogger } from "@/lib/logging/log";
import { harvestBatch } from "@/services/search/images";
import type { Recorder } from "@/services/runs/recorder";
import { assembleContext } from "./context";
import { outputBlock } from "./prompts";
import { VisualPromptOutputSchema, type ContentItem, type Source, type VisualPromptOutput } from "./schema";
import { sourceStore } from "./store";
import { runStage } from "./stage";

const log = createLogger("studio/visual");

const STAGE = "visual-prompt";

/**
 * The picture half of a post.
 *
 * Two things live here and they are deliberately different in kind. Harvesting
 * asks the sources what image they offer for sharing - no model, no tokens, and
 * the answer is a reference to somebody else's work with their credit attached.
 * The prompt stage is the fallback for when the answer is nothing: a brief for
 * an image the user generates themselves, which is theirs.
 *
 * Neither runs during a daily run. A picture is not on the critical path to a
 * post, and putting it there would mean paying for one on every run that gets
 * rejected at the claims gate.
 */

/* -------------------------------------------------------------- harvesting -- */

export interface HarvestReport {
  sources: Source[];
  /** Sources whose page could not be read, by domain, for the "why nothing" line. */
  unreachable: string[];
}

/**
 * Reads each source's page for its social-card image and stores what it finds
 * on the source record. Runs at most once per source: a stored `imageCheckedAt`
 * means the question has been asked and answered, including when the answer was
 * "this page offers nothing".
 */
export async function harvestSourceImages(sources: Source[]): Promise<HarvestReport> {
  const pending = sources.filter((source) => !source.imageCheckedAt);
  if (pending.length === 0) return { sources, unreachable: [] };

  const outcomes = await harvestBatch(pending, (source) => source.url);
  const now = new Date().toISOString();
  const unreachable: string[] = [];
  const updated = new Map<string, Source>();

  for (const outcome of outcomes) {
    if (outcome.error) {
      unreachable.push(outcome.item.domain || outcome.item.url);
      // Not marked as checked: an unreachable host today may be reachable
      // tomorrow, and recording "no image" would make that permanent.
      continue;
    }
    const saved = await sourceStore.put({ ...outcome.item, image: outcome.image, imageCheckedAt: now });
    updated.set(saved.id, saved);
  }

  const found = [...updated.values()].filter((source) => source.image).length;
  log.info(`harvested ${found} image(s) from ${pending.length} source(s)`);
  return { sources: sources.map((source) => updated.get(source.id) ?? source), unreachable };
}

/* ------------------------------------------------------------------ prompt -- */

const OUTPUT_SHAPE = [
  "{",
  '  "concept": "one line naming the idea",',
  '  "prompt": "the full prompt for an image generator",',
  '  "negativePrompt": "what to avoid, or an empty string",',
  '  "altText": "what the finished image shows, for a screen reader",',
  '  "aspectRatio": "1:1"|"16:9"|"4:5"',
  "}",
].join("\n");

export interface VisualPromptInput {
  content: Pick<ContentItem, "text" | "angle" | "thesis">;
  persona: Persona;
  /** Only their domains and titles: this stage never needs the evidence itself. */
  sources: Source[];
  /**
   * Set when the brief is for one post inside a thread. Without it a model
   * briefing post 4 illustrates the whole argument again, which is how a thread
   * ends up with five pictures of the same idea.
   */
  position?: { index: number; total: number };
  recorder: Recorder;
  fixtureCase?: string;
}

function buildPrompt(input: VisualPromptInput) {
  return assembleContext(STAGE, [
    {
      section: "instructions",
      text: [
        "You brief an image generator for a post that is already written.",
        "",
        "You do not rewrite the post, suggest a different angle, or comment on the writing.",
        "The image supports the post; it does not restate it.",
        "",
        "Rules:",
        "  - Describe one concrete scene or one diagram. A vague mood is not a brief.",
        "  - No text, words, numbers, logos or watermarks in the image. Generators render text badly",
        "    and a misspelled chart label undoes the credibility the post just earned.",
        "  - No real people, no real company logos, no imitation of a named artist's style.",
        "  - Do not invent data. A chart-like image must be schematic, not a specific claim with numbers.",
        "  - Say what the image is made of: subject, composition, lighting, palette, medium.",
        "  - Pick the aspect ratio the post's platform rewards: 16:9 for a link-style card,",
        "    4:5 for a feed image, 1:1 when neither is obviously better.",
      ].join("\n"),
    },
    {
      section: "evidence",
      text: [
        `ANGLE: ${input.content.angle}`,
        `THESIS: ${input.content.thesis}`,
        "",
        input.position
          ? `POST ${input.position.index} of a ${input.position.total}-post thread. ` +
            "Illustrate this post only, not the whole argument. The other posts are getting their own images."
          : "POST",
        input.content.text,
      ].join("\n"),
    },
    {
      section: "persona",
      text: [
        `The writer: ${input.persona.identityStatement}`,
        input.persona.pillars.filter((pillar) => pillar.enabled).length > 0
          ? `Subjects they own: ${input.persona.pillars.filter((pillar) => pillar.enabled).map((pillar) => pillar.name).join(", ")}`
          : "",
        "Match their register. A serious technical post does not want a cartoon.",
      ].filter(Boolean).join("\n"),
    },
    { section: "output", text: outputBlock("VisualPrompt", OUTPUT_SHAPE) },
  ]);
}

export interface VisualPromptResult {
  output: VisualPromptOutput;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costEstimate: number;
}

/**
 * One fast-tier call, on demand only. Small budget: this is a paragraph of
 * description, and a stage given room to ramble will use it.
 */
export async function runVisualPrompt(input: VisualPromptInput): Promise<VisualPromptResult> {
  const { prompt, usage } = buildPrompt(input);
  const result = await runStage({
    stage: STAGE,
    tier: "fast",
    prompt,
    schema: VisualPromptOutputSchema,
    schemaName: "VisualPrompt",
    maxTokens: 900,
    temperature: 0.7,
    recorder: input.recorder,
    usage,
    fixtureCase: input.fixtureCase,
  });

  return {
    output: result.data,
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costEstimate: result.costEstimate,
  };
}
