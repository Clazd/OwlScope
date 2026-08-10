import "server-only";
import type { Persona } from "@/domain/persona/schema";
import { createLogger } from "@/lib/logging/log";
import type { Recorder } from "@/services/runs/recorder";
import { assembleContext } from "./context";
import {
  memoryBlock,
  outputBlock,
  personaBlock,
  researchBlock,
  sourcesBlock,
  truthfulnessBlock,
} from "./prompts";
import {
  ThreadOutputSchema,
  type ContentItem,
  type ResearchRecord,
  type Sentence,
  type Source,
  type ThreadPost,
  type ThreadPostPayload,
  type ValidationOutput,
} from "./schema";
import { runStage } from "./stage";
import { X_LIMIT, countCharacters, reassemble } from "./text";
import { runValidation } from "./validate";
import { lockSentences } from "./write";

const log = createLogger("studio/thread");

const STAGE = "thread";

/**
 * Expanding one finalised post into an X thread.
 *
 * The design decision that everything else follows from: post 1 is the post
 * that already exists, byte for byte, and the model is only asked for what comes
 * after it. The post that cleared research, critique, validation and the gates
 * is not handed back to a language model for another pass, and the output schema
 * has nowhere to put a rewritten one.
 *
 * Everything after it is held to the same standard as the first: typed
 * sentences, citations into the same fixed source set, a validator pass, and a
 * character count done in code. A thread is a bigger claim surface than a post,
 * not a looser one.
 *
 * Like the image prompt, this never runs during a daily run. It is a button.
 */

/** X threads get unreadable long before this. The cap is a backstop, not a target. */
export const MAX_THREAD_POSTS = 8;

/** X accepts four images on a post. A fifth is not a preference, it is a rejection. */
export const MAX_IMAGES_PER_POST = 4;

/* ------------------------------------------------------------------ prompt -- */

const OUTPUT_SHAPE = [
  "{",
  '  "continuation": [{',
  '    "text": "the post exactly as it would be published",',
  '    "sentences": [{"id":"s1","text":"…","claimType":"fact"|"inference"|"opinion"|"rhetorical",',
  '                  "sourceIds":["src_…"],"support":"supported"|"partial"|"unsupported"|"n/a"}]',
  "  }]",
  "}",
].join("\n");

export interface ThreadInput {
  content: Pick<ContentItem, "text" | "angle" | "thesis" | "sentences" | "characterCount" | "visualPrompt">;
  research: ResearchRecord | null;
  sources: Source[];
  persona: Persona;
  recentPosts: Array<{ text: string; createdAt: string }>;
  recorder: Recorder;
  fixtureCase?: string;
}

function buildPrompt(input: ThreadInput) {
  return assembleContext(STAGE, [
    {
      section: "instructions",
      text: [
        "You are continuing a post that is already written and already checked.",
        "",
        "POST 1 - fixed. It ships exactly as it is. Do not rewrite it, improve it, or return it.",
        input.content.text,
        "",
        `Write the posts that come after it: between 2 and ${MAX_THREAD_POSTS - 1} of them.`,
        "",
        truthfulnessBlock(),
        "",
        "WHAT A GOOD CONTINUATION IS",
        "  - One idea per post. A post that carries two ideas is two posts.",
        "  - Each post has to earn its place. Write as many as the evidence carries and stop.",
        "    A thread padded to a round number is worse than a short one that lands.",
        "  - Do not restate post 1. The reader has just read it.",
        "  - Go where post 1 could not: the mechanism behind the claim, the number and where it",
        "    came from, the case that does not fit, what would change your mind.",
        "  - The last post lands the argument. No summary of what was just said, no",
        '    "follow for more", no call to action, no question fishing for replies.',
        "",
        `HARD LENGTH LIMIT: every post at most ${X_LIMIT} characters, including spaces.`,
        "Count before returning. A post over the limit cannot be published.",
        "",
        'Do not number the posts. No "1/5", no "🧵", no thread emoji. The numbering is added',
        "for you, and a hard-coded count is wrong the moment a post gets cut.",
        "Do not use em dashes. Use commas, colons, parentheses, or a plain hyphen.",
        "No hashtags unless the persona's fingerprint says hashtags are common.",
        "",
        "SENTENCE RULES - each post is an array of sentences, not a blob of text.",
        "  - Split each post into its sentences, in order. text must be exactly those sentences",
        "    joined with single spaces.",
        '  - claimType "fact" is a checkable statement about the world. It MUST cite sourceIds.',
        '  - claimType "inference" is a conclusion you drew from the evidence. Cite what it rests on.',
        '  - claimType "opinion" is a judgement offered as one. support is "n/a", sourceIds may be empty.',
        '  - claimType "rhetorical" asserts nothing. support is "n/a".',
        "  - Restart sentence ids at s1 in every post.",
        "  - A thread is more room, not weaker evidence. Every fact in every post cites a source",
        "    from the list below. A claim you cannot cite does not get to ride along behind a",
        "    post that could.",
        "",
        `THE ARGUMENT: ${input.content.angle} - ${input.content.thesis}`,
      ].join("\n"),
    },
    { section: "persona", text: personaBlock(input.persona) },
    ...(input.research ? [{ section: "evidence" as const, text: researchBlock(input.research) }] : []),
    { section: "evidence", text: sourcesBlock(input.sources) },
    { section: "memory", text: memoryBlock(input.recentPosts) },
    { section: "output", text: outputBlock("ThreadOutput", OUTPUT_SHAPE) },
  ]);
}

/* ---------------------------------------------------------------- assembly -- */

/**
 * Which harvested images belong beside which post.
 *
 * A post can only be given the image of a source its own sentences cite, so the
 * picture sits next to the claim it illustrates. Two rules beyond that, and both
 * exist because the obvious greedy version gets it wrong:
 *
 * An image is claimed once. The same card repeated down a thread reads as
 * padding, and the second appearance adds nothing the first did not.
 *
 * And it is dealt in rounds rather than post by post, so every post gets one
 * before any post gets two. Filling post 1 first is how a thread ends up with
 * four pictures at the top and four bare posts underneath, which is the exact
 * shape this feature exists to avoid.
 */
export function assignThreadImages(
  posts: ReadonlyArray<{ sentences: Sentence[] }>,
  sources: Source[],
): string[][] {
  const withImage = new Set(sources.filter((source) => source.image).map((source) => source.id));
  const cited = posts.map((post) =>
    [...new Set(post.sentences.flatMap((sentence) => sentence.sourceIds))].filter((id) => withImage.has(id)),
  );

  const picked: string[][] = posts.map(() => []);
  const claimed = new Set<string>();

  for (let round = 0; round < MAX_IMAGES_PER_POST; round += 1) {
    let dealt = false;
    for (let position = 0; position < posts.length; position += 1) {
      const held = picked[position];
      // A post that fell behind stays behind: `claimed` only grows, so a post
      // with nothing to take this round has nothing to take in the next one.
      if (!held || held.length !== round) continue;
      const next = cited[position]?.find((id) => !claimed.has(id));
      if (!next) continue;
      held.push(next);
      claimed.add(next);
      dealt = true;
    }
    if (!dealt) break;
  }

  return picked;
}

/**
 * Turns the model's continuation into stored thread posts, with post 1 carried
 * over unchanged from the content item.
 *
 * Recomputed rather than trusted, for the same reasons as the writer: sentence
 * ids (prefixed per post, so the validator's verdicts map onto exactly one
 * sentence in the whole thread), the character count, and the flattened text.
 */
export function assembleThread(
  content: Pick<ContentItem, "text" | "sentences" | "characterCount" | "visualPrompt">,
  continuation: ThreadPostPayload[],
  sources: Source[],
): ThreadPost[] {
  const posts: ThreadPost[] = [
    {
      index: 1,
      text: content.text,
      sentences: content.sentences,
      characterCount: content.characterCount,
      imageSourceIds: [],
      visualPrompt: content.visualPrompt,
      warnings: [],
    },
  ];

  for (const payload of continuation.slice(0, MAX_THREAD_POSTS - 1)) {
    const index = posts.length + 1;
    const { sentences: locked, warnings } = lockSentences(payload.sentences, sources);
    const sentences = locked.map((sentence, position) => ({ ...sentence, id: `p${index}s${position + 1}` }));

    const text = reassemble(sentences);
    if (!text) continue;

    const characterCount = countCharacters(text);
    if (characterCount > X_LIMIT) {
      warnings.push(`${characterCount} characters, past the ${X_LIMIT} limit. Cut it before you post.`);
    }

    posts.push({ index, text, sentences, characterCount, imageSourceIds: [], visualPrompt: null, warnings });
  }

  const images = assignThreadImages(posts, sources);
  return posts.map((post, position) => ({ ...post, imageSourceIds: images[position] ?? [] }));
}

/**
 * Settles support from the validator's verdicts and writes the findings each
 * post carries into the UI.
 *
 * A null validation is not a pass. It means the thread was written but never
 * checked, and every post that was not checked says so - the alternative is a
 * thread that looks exactly like a validated one because nothing was written in
 * the space where the problem would have gone.
 */
export function finaliseThreadPosts(posts: ThreadPost[], validation: ValidationOutput | null): ThreadPost[] {
  const verdicts = new Map(validation?.sentences.map((verdict) => [verdict.id, verdict]) ?? []);

  return posts.map((post) => {
    if (post.index === 1) return post;

    if (!validation) {
      return {
        ...post,
        warnings: [...post.warnings, "Not checked against the sources: the validator did not run."],
      };
    }

    const sentences = post.sentences.map((sentence) => {
      const verdict = verdicts.get(sentence.id);
      if (!verdict) return sentence;
      // The validator has no verdict for "asserts nothing checkable" - its
      // vocabulary stops at supported/partial/unsupported - so an opinion keeps
      // the n/a it was written with rather than being marked unsupported for
      // failing to be a fact.
      if (sentence.claimType === "opinion" || sentence.claimType === "rhetorical") return sentence;
      return {
        ...sentence,
        support: verdict.support,
        sourceIds: verdict.sourceIds.length > 0 ? verdict.sourceIds : sentence.sourceIds,
      };
    });

    const unsupported = sentences
      .filter((sentence) => sentence.claimType === "fact" && sentence.support === "unsupported")
      .map((sentence) => `${sentence.id} states a fact nothing retrieved supports. Cut it or qualify it.`);

    return { ...post, sentences, warnings: [...post.warnings, ...unsupported] };
  });
}

/* ------------------------------------------------------------------- stage -- */

export interface ThreadResult {
  posts: ThreadPost[];
  validation: ValidationOutput | null;
  model: string;
}

/**
 * One strong-tier call to write the continuation, then one fast-tier validator
 * pass over what it wrote.
 *
 * The validator only sees the new posts. Post 1 was validated when it became a
 * post, and paying to check it again on every thread would be paying for an
 * answer already on disk.
 */
export async function runThread(input: ThreadInput): Promise<ThreadResult> {
  const { prompt, usage } = buildPrompt(input);
  const written = await runStage({
    stage: STAGE,
    tier: "strong",
    prompt,
    schema: ThreadOutputSchema,
    schemaName: "ThreadOutput",
    maxTokens: 2600,
    temperature: 0.8,
    recorder: input.recorder,
    usage,
    fixtureCase: input.fixtureCase,
  });

  const assembled = assembleThread(input.content, written.data.continuation, input.sources);
  const continuation = assembled.filter((post) => post.index > 1).flatMap((post) => post.sentences);

  let validation: ValidationOutput | null = null;
  if (continuation.length > 0) {
    try {
      validation = await runValidation({
        sentences: continuation,
        sources: input.sources,
        recorder: input.recorder,
        // Its own case, because the thread's sentence ids are not the post's.
        // Outside sandbox mode nothing reads this.
        fixtureCase: input.fixtureCase ?? "thread",
      });
    } catch (err) {
      // The continuation is already written and already paid for. Losing it
      // because the checker fell over would be the wrong trade; saying so on
      // every post is the right one.
      log.error(`the thread was written but not validated: ${(err as Error).message}`);
    }
  }

  const posts = finaliseThreadPosts(assembled, validation);
  log.info(`thread of ${posts.length} post(s), ${posts.filter((post) => post.warnings.length > 0).length} with findings`);

  return { posts, validation, model: written.model };
}
