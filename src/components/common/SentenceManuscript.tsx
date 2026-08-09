import { cn } from "@/lib/format/cn";
import { EpistemicChip, type EpistemicState } from "./EpistemicChip";

export interface ManuscriptSentence {
  id: string;
  text: string;
  state: EpistemicState;
  /** Source count backing this sentence. Wired up in slice 3. */
  sourceCount?: number;
}

interface SentenceManuscriptProps {
  sentences: ManuscriptSentence[];
  onSelect?: (id: string) => void;
  className?: string;
}

/**
 * The Evidence Margin renderer — STUB.
 *
 * Slice 1 ships the reading surface and the margin, which is enough to prove
 * the type ramp and the four-colour system carry a real paragraph. Slice 3
 * replaces it with the real thing: click-through to sources, hover highlights,
 * per-sentence source lists.
 *
 * The manuscript face is Newsreader, and it is the only place a serif appears.
 * Prose a human reads is serif; machine output is mono; everything else is sans.
 */
export function SentenceManuscript({ sentences, onSelect, className }: SentenceManuscriptProps) {
  return (
    <div className={cn("reading-column", className)}>
      {sentences.map((sentence) => (
        <div
          key={sentence.id}
          className="grid gap-2 border-b border-rule py-3 last:border-b-0 sm:grid-cols-[1fr_140px]"
        >
          <p className="type-manuscript text-ink">
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(sentence.id)}
                className="cursor-pointer text-left hover:bg-surface-sunken"
              >
                {sentence.text}
              </button>
            ) : (
              sentence.text
            )}
          </p>
          <aside className="flex items-start gap-2 sm:justify-end">
            <EpistemicChip state={sentence.state} />
            {sentence.sourceCount !== undefined && (
              <span data-mono className="type-data text-ink-3 pt-1">
                {sentence.sourceCount}
              </span>
            )}
          </aside>
        </div>
      ))}
    </div>
  );
}
