import "server-only";
import { scoreAgainstFingerprint } from "@/domain/persona/fingerprint";
import type { ExperienceItem, Fingerprint, Persona } from "@/domain/persona/schema";
import { createLogger } from "@/lib/logging/log";
import type { Recorder } from "@/services/runs/recorder";
import { assembleContext } from "./context";
import {
  experienceBlock,
  fingerprintBlock,
  memoryBlock,
  outputBlock,
  personaBlock,
  researchBlock,
  sourcesBlock,
  topicBlock,
  truthfulnessBlock,
} from "./prompts";
import {
  DraftsOutputSchema,
  type Angle,
  type DraftPayload,
  type ResearchRecord,
  type Sentence,
  type Source,
  type StudioDraft,
  type Topic,
} from "./schema";
import { runStage } from "./stage";
import { X_LIMIT, characterCountOf, reassemble, removeForbiddenPunctuation, renumber } from "./text";
import { newId } from "./store";

const log = createLogger("studio/write");

const STAGE = "drafts";
const REVISE_STAGE = "revise";

/**
 * Stage 4. Up to three substantially different drafts, each in the Evidence
 * Lock shape.
 *
 * The writer receives exactly: persona snapshot, active pillar, relevant
 * beliefs, voice rules, the fingerprint block, the experience log when the
 * topic could invite a first-hand claim, the selected angle, and the validated
 * research. Nothing else. Every extra thing in a writer prompt is a thing the
 * post might end up being about.
 */

const OUTPUT_SHAPE = [
  "{",
  '  "drafts": [{',
  '    "text": "the post exactly as it would be published",',
  '    "sentences": [{"id":"s1","text":"…","claimType":"fact"|"inference"|"opinion"|"rhetorical",',
  '                  "sourceIds":["src_…"],"support":"supported"|"partial"|"unsupported"|"n/a"}],',
  '    "toneTags": ["direct","technical"]',
  "  }]",
  "}",
].join("\n");

const SENTENCE_RULES = [
  "SENTENCE RULES - the post is an array of sentences, not a blob of text.",
  "  - Split the post into its sentences, in order. text must be exactly those sentences joined with single spaces.",
  '  - claimType "fact" is a checkable statement about the world. It MUST cite sourceIds.',
  '  - claimType "inference" is a conclusion you drew from the evidence. Cite what it rests on.',
  '  - claimType "opinion" is a judgement offered as one. support is "n/a" and sourceIds may be empty.',
  '  - claimType "rhetorical" is a question or framing that asserts nothing. support is "n/a".',
  "  - Never mark a sentence supported unless a listed source actually carries it.",
  "  - A fact you cannot cite does not belong in the post. Drop it or write it as an opinion.",
];

const STYLE_RULES = [
  "Do not use em dashes. Use commas, colons, parentheses, or a plain hyphen when punctuation is needed.",
];

export interface WriteInput {
  topic: Topic;
  angle: Angle;
  research: ResearchRecord;
  sources: Source[];
  persona: Persona;
  fingerprint: Fingerprint | null;
  /** Only passed when the topic could invite a first-hand claim. */
  experience: ExperienceItem[] | null;
  recentPosts: Array<{ text: string; createdAt: string }>;
  count?: number;
  recorder: Recorder;
  fixtureCase?: string;
}

function buildPrompt(input: WriteInput) {
  const count = input.count ?? 3;
  const activePillar = input.persona.pillars.find((pillar) => pillar.id === input.topic.pillarId);

  return assembleContext(STAGE, [
    {
      section: "instructions",
      text: [
        `You are the writer. Write ${count} substantially different drafts of one post.`,
        "",
        "Different means different structure and different emphasis, not different synonyms.",
        "",
        truthfulnessBlock(),
        "",
        `HARD LENGTH LIMIT: every draft must be at most ${X_LIMIT} characters, including spaces.`,
        "Count before returning the tool input. A longer draft is unusable and will be rejected before review.",
        "No hashtags unless the fingerprint says hashtags are common. No engagement bait, no hook templates.",
        "Do not open with a question unless the angle is a question angle.",
        ...STYLE_RULES,
        "",
        ...SENTENCE_RULES,
        "",
        "SELECTED ANGLE - write all drafts on this angle. Do not switch to another one.",
        `  ${input.angle.kind}: ${input.angle.thesis}`,
        `  Why it fits: ${input.angle.whyItFits}`,
        activePillar ? `  Pillar: ${activePillar.name} - ${activePillar.description}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    { section: "persona", text: personaBlock(input.persona) },
    { section: "persona", text: fingerprintBlock(input.fingerprint) },
    ...(input.experience ? [{ section: "persona" as const, text: experienceBlock(input.experience) }] : []),
    { section: "evidence", text: topicBlock(input.topic) },
    { section: "evidence", text: researchBlock(input.research) },
    { section: "evidence", text: sourcesBlock(input.sources) },
    { section: "memory", text: memoryBlock(input.recentPosts) },
    { section: "output", text: outputBlock("DraftsOutput", OUTPUT_SHAPE) },
  ]);
}

/* ------------------------------------------------------------- assembly -- */

/**
 * Turns a validated model payload into a stored draft.
 *
 * Three things are recomputed rather than trusted: the sentence ids (a model
 * that returns duplicates would break every cross-reference), the character
 * count (models cannot count), and the flattened text (the sentence array is
 * the source of truth, so the join is authoritative). Anything corrected here
 * becomes a visible warning rather than a silent fix.
 */
export function assembleDraft(
  payload: DraftPayload,
  sources: Source[],
  fingerprint: Fingerprint | null,
): StudioDraft {
  const warnings: string[] = [];
  const known = new Set(sources.map((source) => source.id));

  const cleaned: Sentence[] = payload.sentences.map((sentence) => {
    const kept = sentence.sourceIds.filter((id) => known.has(id));
    if (kept.length !== sentence.sourceIds.length) {
      const dropped = sentence.sourceIds.filter((id) => !known.has(id));
      warnings.push(`Dropped citation${dropped.length > 1 ? "s" : ""} to unknown source ${dropped.join(", ")}.`);
      log.warn(`dropped unknown source id(s): ${dropped.join(", ")}`);
    }
    // A factual claim citing nothing cannot be "supported", whatever the writer
    // said about it. The validator gets the last word, but not the first.
    const support =
      sentence.claimType === "fact" && kept.length === 0
        ? ("unsupported" as const)
        : sentence.claimType === "opinion" || sentence.claimType === "rhetorical"
          ? ("n/a" as const)
          : sentence.support;
    return { ...sentence, text: removeForbiddenPunctuation(sentence.text), sourceIds: kept, support };
  });

  const { sentences } = renumber(cleaned);
  const text = reassemble(sentences);
  const characterCount = characterCountOf(sentences);
  if (characterCount > X_LIMIT) {
    warnings.push(`${characterCount} characters, past the ${X_LIMIT} limit.`);
  }

  const scored = scoreAgainstFingerprint(text, fingerprint);

  return {
    id: newId(),
    text,
    sentences,
    characterCount,
    toneTags: payload.toneTags.slice(0, 6),
    fingerprintScore: scored.unscored ? 0 : scored.score,
    fingerprintScored: !scored.unscored,
    fingerprintDeviations: scored.deviations.map((d) => d.message),
    similarity: null,
    warnings,
  };
}

export async function runDrafts(input: WriteInput): Promise<StudioDraft[]> {
  const { prompt, usage } = buildPrompt(input);
  const result = await runStage({
    stage: STAGE,
    tier: "strong",
    prompt,
    schema: DraftsOutputSchema,
    schemaName: "DraftsOutput",
    maxTokens: 2400,
    temperature: 0.85,
    recorder: input.recorder,
    usage,
    fixtureCase: input.fixtureCase,
  });

  return result.data.drafts.slice(0, input.count ?? 3).map((draft) =>
    assembleDraft(draft, input.sources, input.fingerprint),
  );
}

/* -------------------------------------------------------------- revision -- */

export const REVISION_ACTIONS = {
  rewrite: "Rewrite it. Same angle, same claims, different construction.",
  shorten: "Cut it down. Remove whatever is not load-bearing. Do not lose a cited fact.",
  expand: "Give it more room. Add substance from the evidence, not more adjectives.",
  "more-technical": "Go more technical. Name the mechanism, use the precise term.",
  "more-casual": "Loosen it. Shorter words, plainer sentences. Do not add slang the samples do not use.",
  "more-opinionated": "Take a firmer position. State the judgement plainly as an opinion.",
  "less-ai": [
    "Remove what makes it read as machine-written: balanced triads, 'not just X but Y',",
    "'in today's world', symmetrical clauses, a summary sentence restating the opening.",
    "Say one thing and stop.",
  ].join(" "),
  "remove-cliche": "Remove the clichés and stock phrases. Say the thing directly instead.",
  regenerate: "Start over from the angle and the evidence. Do not reuse this draft's structure.",
} as const;

export type RevisionAction = keyof typeof REVISION_ACTIONS;

export interface ReviseInput extends WriteInput {
  draft: StudioDraft;
  action: RevisionAction;
}

export async function runRevision(input: ReviseInput): Promise<StudioDraft> {
  const { prompt, usage } = assembleContext(REVISE_STAGE, [
    {
      section: "instructions",
      text: [
        "Revise one draft of a post. One revision, one instruction.",
        "",
        `INSTRUCTION: ${REVISION_ACTIONS[input.action]}`,
        "",
        truthfulnessBlock(),
        "",
        `Length: at most ${X_LIMIT} characters.`,
        "Keep the angle. Do not add a claim the evidence does not carry, even to fill space.",
        ...STYLE_RULES,
        "",
        ...SENTENCE_RULES,
        "",
        "CURRENT DRAFT",
        input.draft.text,
        "",
        ...(input.draft.fingerprintDeviations.length > 0
          ? ["Measured problems with the current draft:", ...input.draft.fingerprintDeviations.map((d) => `  ${d}`)]
          : []),
      ].join("\n"),
    },
    { section: "persona", text: personaBlock(input.persona) },
    { section: "persona", text: fingerprintBlock(input.fingerprint) },
    ...(input.experience ? [{ section: "persona" as const, text: experienceBlock(input.experience) }] : []),
    { section: "evidence", text: researchBlock(input.research) },
    { section: "evidence", text: sourcesBlock(input.sources) },
    { section: "output", text: outputBlock("DraftsOutput", OUTPUT_SHAPE) },
  ]);

  const result = await runStage({
    stage: REVISE_STAGE,
    tier: "strong",
    prompt,
    schema: DraftsOutputSchema,
    schemaName: "DraftsOutput",
    maxTokens: 1400,
    temperature: input.action === "regenerate" ? 0.95 : 0.7,
    recorder: input.recorder,
    usage,
    fixtureCase: input.fixtureCase,
  });

  const first = result.data.drafts[0];
  if (!first) throw new Error("The revision returned no draft.");
  return assembleDraft(first, input.sources, input.fingerprint);
}

/**
 * Whether the topic could invite a first-hand claim, and therefore whether the
 * experience log belongs in the prompt at all.
 *
 * Sending it always would be simpler and slightly worse: the log is a list of
 * things the writer has done, and putting it in front of a model writing about
 * something abstract is an invitation to work one in.
 */
export function invitesFirstHandClaim(topic: Topic, angle: Angle | null): boolean {
  const text = `${topic.title} ${topic.summary} ${angle?.thesis ?? ""} ${angle?.kind ?? ""}`.toLowerCase();
  return /\b(try|tried|trying|use|used|using|build|built|building|ship|shipped|test|tested|run|ran|experience|switch|migrat\w*|adopt\w*|review)\b/.test(
    text,
  );
}
