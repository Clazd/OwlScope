import "server-only";
import { z } from "zod";
import type { Persona } from "@/domain/persona/schema";
import { newId } from "@/lib/ids";
import { createLogger } from "@/lib/logging/log";
import type { Recorder } from "@/services/runs/recorder";
import { assembleContext } from "./context";
import { outputBlock } from "./prompts";
import {
  type Angle,
  type ContentItem,
  type ContentStatus,
  type CritiqueRecord,
  type ResearchRecord,
  type SimilarityRecord,
  type Source,
  type StudioDraft,
  type Topic,
  type ValidationOutput,
} from "./schema";
import { runStage } from "./stage";
import { applyTransition } from "./state-machine";
import { contentStore } from "./store";

const log = createLogger("studio/finalise");

const STAGE = "reasoning";

/**
 * Stage 6. Turning a selected draft into a stored content item, and writing the
 * reasoning block that goes with it.
 *
 * The reasoning is rule 7 made concrete: plain language, first person, brief,
 * and about the decisions rather than the output. "Chose an opinion angle
 * because your last two posts were explanatory" is useful. "This post is
 * engaging and informative" is not, and the prompt says so.
 */

const ReasoningSchema = z.object({
  reasoning: z.string().min(1),
});

export interface ReasoningInput {
  topic: Topic;
  angle: Angle;
  draft: StudioDraft;
  research: ResearchRecord;
  sources: Source[];
  similarity: SimilarityRecord | null;
  recentPosts: Array<{ text: string; createdAt: string }>;
  recorder: Recorder;
  fixtureCase?: string;
}

export async function runReasoning(input: ReasoningInput): Promise<string> {
  const freshest = input.sources
    .filter((source) => source.publishedAt)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))[0];

  const { prompt, usage } = assembleContext(STAGE, [
    {
      section: "instructions",
      text: [
        "Explain, in first person and in plain language, why this is the post.",
        "",
        "Three or four short sentences. Cover: why this angle rather than another, where the",
        "factual claims came from, and how it relates to what has already been posted.",
        "",
        "Write like a colleague explaining a choice, not like a report.",
        "Do not praise the post. Do not describe it as engaging, compelling or valuable.",
        "Do not restate the post's content back.",
        "",
        "MATERIAL",
        `  Angle chosen: ${input.angle.kind} - ${input.angle.thesis}`,
        `  Why it was said to fit: ${input.angle.whyItFits}`,
        `  Sources: ${input.sources.length}${
          freshest ? `, freshest published ${freshest.publishedAt} (${freshest.domain})` : ", none dated"
        }`,
        `  Freshness: ${input.research.freshness.assessment}. ${input.research.freshness.note}`,
        `  Similarity: risk ${input.similarity?.result.risk ?? "unknown"}, checked against ${
          input.similarity?.result.comparedAgainst ?? 0
        } prior posts`,
        ...(input.recentPosts.length > 0
          ? [`  The last few posts were about: ${input.recentPosts.slice(0, 3).map((p) => truncate(p.text, 70)).join(" | ")}`]
          : ["  Nothing has been posted yet."]),
        "",
        "THE POST",
        input.draft.text,
      ].join("\n"),
    },
    { section: "output", text: outputBlock("Reasoning", '{"reasoning":"…"}') },
  ]);

  const result = await runStage({
    stage: STAGE,
    tier: "fast",
    prompt,
    schema: ReasoningSchema,
    schemaName: "Reasoning",
    maxTokens: 400,
    temperature: 0.4,
    recorder: input.recorder,
    usage,
    fixtureCase: input.fixtureCase,
  });

  return result.data.reasoning.trim();
}

/* ----------------------------------------------------------- persistence -- */

export interface CreateContentInput {
  topic: Topic;
  angle: Angle;
  draft: StudioDraft;
  persona: Persona;
  validation: ValidationOutput | null;
  critique: CritiqueRecord | null;
  similarity: SimilarityRecord | null;
  reasoning: string;
  override: { reason: string; sentenceIds: string[] } | null;
  provider: string;
  model: string;
  runId: string;
}

/**
 * Writes the content item.
 *
 * It always starts at `draft`. Generated is never treated as published, and the
 * only way past `draft` is a transition the user asked for - there is no code
 * path here that sets any other initial status.
 */
export async function createContentItem(input: CreateContentInput): Promise<ContentItem> {
  const now = new Date().toISOString();
  const sourceIds = [...new Set(input.draft.sentences.flatMap((sentence) => sentence.sourceIds))];

  const item: ContentItem = {
    id: newId(),
    topicId: input.topic.id,
    personaVersion: input.persona.activeVersion,
    status: "draft",
    angle: input.angle.kind,
    thesis: input.angle.thesis,
    text: input.draft.text,
    sentences: input.draft.sentences,
    characterCount: input.draft.characterCount,
    fingerprintScore: input.draft.fingerprintScore,
    sourceIds,
    critique: input.critique,
    validation: input.validation,
    similarity: input.similarity,
    reasoning: input.reasoning,
    override: input.override ? { ...input.override, at: now } : null,
    visualPrompt: null,
    thread: null,
    rejectionReasons: [],
    provider: input.provider,
    model: input.model,
    runId: input.runId,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    publicUrl: null,
  };

  log.info(`content ${item.id} created as draft`);
  return contentStore.put(item);
}

export interface TransitionInput {
  contentId: string;
  to: ContentStatus;
  publicUrl?: string | null;
  rejectionReasons?: string[];
}

/**
 * The only way a content item's status changes.
 *
 * Copying is not in this file, because copying is not a transition. The copy
 * button calls nothing on the server at all.
 */
export async function transitionContent(input: TransitionInput): Promise<ContentItem> {
  const current = await contentStore.get(input.contentId);
  if (!current) throw new Error(`No content item ${input.contentId}.`);

  const next = applyTransition(current, input.to, { publicUrl: input.publicUrl });
  const saved = await contentStore.put({
    ...current,
    ...next,
    rejectionReasons:
      input.to === "rejected" ? (input.rejectionReasons ?? current.rejectionReasons) : current.rejectionReasons,
    updatedAt: new Date().toISOString(),
  });
  log.info(`content ${saved.id}: ${current.status} -> ${saved.status}`);
  return saved;
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit).trimEnd()}…`;
}
