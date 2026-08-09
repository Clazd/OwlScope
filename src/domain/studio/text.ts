/**
 * Structurally typed so this module imports nothing. `schema.ts` needs
 * `checkReassembly` inside a refinement, and a cycle between the two would be
 * a real problem for a file every stage loads.
 */
interface TextLike {
  text: string;
}

interface SentenceLike extends TextLike {
  id: string;
}

/**
 * Sentence reassembly and character counting.
 *
 * Both are pure, both are counted in code, and neither is ever asked of a
 * model — for the same reason the fingerprint statistics are not. A model that
 * miscounts a character limit produces a post that cannot be published.
 */

/* ------------------------------------------------------------ reassembly -- */

/** The join. A draft's flattened `text` is always exactly this. */
export function reassemble(sentences: ReadonlyArray<TextLike>): string {
  return sentences
    .map((s) => s.text.trim())
    .filter((s) => s.length > 0)
    .join(" ");
}

/**
 * Whitespace-insensitive comparison, because "does the model's flattened text
 * match its sentences" is a question about content, not about how many spaces
 * it put after a full stop. A paragraph break in `text` is a formatting choice;
 * a missing clause is a validation failure.
 */
function canonical(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export interface ReassemblyCheck {
  ok: boolean;
  /** The join of the sentences — the value that is stored either way. */
  reassembled: string;
  /** Populated when the check fails, for the error the stage throws. */
  detail: string;
}

/**
 * Checks the writer's flattened text against its own sentence array.
 *
 * A mismatch means the sentence array and the post disagree about what the post
 * says, which makes every downstream annotation a lie. That is a validation
 * failure, handled by the same repair-once-then-fail path as a schema error.
 */
export function checkReassembly(text: string, sentences: ReadonlyArray<TextLike>): ReassemblyCheck {
  const reassembled = reassemble(sentences);
  if (canonical(text) === canonical(reassembled)) {
    return { ok: true, reassembled, detail: "" };
  }
  return {
    ok: false,
    reassembled,
    detail:
      `The flattened text does not reassemble from the sentence array. ` +
      `Sentences join to ${JSON.stringify(reassembled)} but text is ${JSON.stringify(canonical(text))}. ` +
      `Return the same words in both fields.`,
  };
}

/* ------------------------------------------------------------- characters -- */

/**
 * X weights every URL as 23 characters regardless of its real length, and
 * counts code points rather than UTF-16 units, so an emoji outside the BMP is
 * one character and not two.
 *
 * This is deliberately not the full twitter-text weighted-length algorithm —
 * that also charges 2 for CJK ranges. Nothing in this product writes CJK today,
 * and a wrong-but-simple counter that claims to be exact would be worse than
 * one whose limits are written down.
 */
export const X_LIMIT = 280;
export const X_URL_WEIGHT = 23;

const URL_PATTERN = /https?:\/\/\S+/g;

export function countCharacters(text: string): number {
  const withoutUrls = text.replace(URL_PATTERN, "");
  const urls = text.match(URL_PATTERN) ?? [];
  return [...withoutUrls].length + urls.length * X_URL_WEIGHT;
}

/** The count used everywhere a draft reports its length. */
export function characterCountOf(sentences: ReadonlyArray<TextLike>): number {
  return countCharacters(reassemble(sentences));
}

export function overLimit(text: string): boolean {
  return countCharacters(text) > X_LIMIT;
}

/* ----------------------------------------------------------------- ids -- */

/**
 * Sentence ids are positional (`s1`, `s2`) and rewritten on every assembly.
 *
 * The model is asked for them, but a model that returns duplicates or gaps
 * would silently break every cross-reference from the validator and the critic.
 * Renumbering in code and remapping the references is cheaper than trusting it.
 */
export function renumber<T extends SentenceLike>(
  sentences: T[],
): { sentences: T[]; remap: Record<string, string> } {
  const remap: Record<string, string> = {};
  const next = sentences.map((sentence, index) => {
    const id = `s${index + 1}`;
    remap[sentence.id] = id;
    return { ...sentence, id };
  });
  return { sentences: next, remap };
}
