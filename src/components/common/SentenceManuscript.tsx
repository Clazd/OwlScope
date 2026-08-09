"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format/cn";
import { EPISTEMIC_LABELS, type EpistemicState } from "./EpistemicChip";
import { MicroLabel } from "./MicroLabel";

export interface ManuscriptSource {
  id: string;
  domain: string;
  /** "6h ago", "2d ago". Formatted by the caller; this component never guesses. */
  age: string;
  quality: string;
}

export interface ManuscriptSentence {
  id: string;
  text: string;
  state: EpistemicState;
  /** The sources backing this sentence, already resolved. */
  sources: ManuscriptSource[];
  /** For an opinion: the belief it argues from, shown in the margin instead. */
  stance?: string;
}

interface SentenceManuscriptProps {
  sentences: ManuscriptSentence[];
  /** Opens the SourceDrawer at that source. */
  onOpenSource?: (sourceId: string) => void;
  /** Scroll-to target from a critique finding. */
  highlightId?: string | null;
  className?: string;
}

const RULE: Record<EpistemicState, string> = {
  supported: "bg-supported",
  partial: "bg-partial",
  unsupported: "bg-unsupported",
  opinion: "bg-opinion",
};

const TEXT: Record<EpistemicState, string> = {
  supported: "text-supported",
  partial: "text-partial",
  unsupported: "text-unsupported",
  opinion: "text-opinion",
};

/**
 * The Evidence Margin.
 *
 * A persistent margin, not a tooltip. The whole point is that the epistemic
 * status of every sentence is visible at once, without hovering anything — a
 * tooltip would mean you can only ever see one claim's provenance at a time,
 * which is the opposite of what this screen is for.
 *
 * Mechanics: each sentence carries a 3px rule in its epistemic colour in the
 * gutter; hovering or focusing one raises its annotation to full opacity and
 * dims the rest to 40%; arrow keys move between sentences; clicking a margin
 * annotation opens the source. Unsupported sentences are underlined, and
 * nothing else in the product is, so they are impossible to miss.
 *
 * On mobile the margin collapses to a tappable dot at the end of each sentence
 * that opens a bottom sheet.
 */
export function SentenceManuscript({
  sentences,
  onOpenSource,
  highlightId = null,
  className,
}: SentenceManuscriptProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLElement>());

  const focused = activeId ?? highlightId;

  useEffect(() => {
    if (!highlightId) return;
    refs.current.get(highlightId)?.scrollIntoView({ block: "center", behavior: "smooth" });
    refs.current.get(highlightId)?.focus();
  }, [highlightId]);

  const move = useCallback(
    (from: string, delta: number) => {
      const index = sentences.findIndex((sentence) => sentence.id === from);
      const next = sentences[index + delta];
      if (!next) return;
      setActiveId(next.id);
      refs.current.get(next.id)?.focus();
    },
    [sentences],
  );

  const sheet = sentences.find((sentence) => sentence.id === sheetId) ?? null;

  return (
    <div className={cn("relative", className)}>
      <article
        className="bg-surface"
        onMouseLeave={() => setActiveId(null)}
        aria-label="Post with evidence margin"
      >
        {sentences.map((sentence) => {
          const dimmed = focused !== null && focused !== sentence.id;
          const unsupported = sentence.state === "unsupported";

          return (
            <div
              key={sentence.id}
              className="grid grid-cols-[3px_1fr] gap-x-3 md:grid-cols-[3px_1fr_200px] md:gap-x-4"
            >
              {/* The 3px epistemic rule, in the gutter between text and margin. */}
              <span
                aria-hidden
                className={cn(
                  "w-[3px] rounded-[1px] transition-opacity duration-(--dur-state)",
                  RULE[sentence.state],
                  dimmed ? "opacity-40" : "opacity-100",
                )}
              />

              <p
                ref={(node) => {
                  if (node) refs.current.set(sentence.id, node);
                  else refs.current.delete(sentence.id);
                }}
                tabIndex={0}
                role="button"
                aria-label={`${sentence.text} — ${EPISTEMIC_LABELS[sentence.state]}`}
                onFocus={() => setActiveId(sentence.id)}
                onBlur={() => setActiveId(null)}
                onMouseEnter={() => setActiveId(sentence.id)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                    event.preventDefault();
                    move(sentence.id, 1);
                  } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
                    event.preventDefault();
                    move(sentence.id, -1);
                  }
                }}
                className={cn(
                  "type-manuscript cursor-default py-2 text-ink outline-none",
                  "transition-opacity duration-(--dur-state)",
                  dimmed && "opacity-60",
                  // The only underline in the product. It means one thing.
                  unsupported && "decoration-unsupported underline decoration-1 underline-offset-4",
                )}
              >
                {sentence.text}
                {/* Mobile: a tappable epistemic dot instead of a margin. */}
                <button
                  type="button"
                  aria-label={`Evidence for this sentence: ${EPISTEMIC_LABELS[sentence.state]}`}
                  onClick={() => setSheetId(sentence.id)}
                  className="ml-2 inline-flex translate-y-[-2px] items-center md:hidden"
                >
                  <span aria-hidden className={cn("size-2 rounded-pill", RULE[sentence.state])} />
                </button>
              </p>

              <Margin
                sentence={sentence}
                dimmed={dimmed}
                onOpenSource={onOpenSource}
                className="hidden md:block"
              />
            </div>
          );
        })}
      </article>

      {sheet && (
        <BottomSheet sentence={sheet} onClose={() => setSheetId(null)} onOpenSource={onOpenSource} />
      )}
    </div>
  );
}

function Margin({
  sentence,
  dimmed,
  onOpenSource,
  className,
}: {
  sentence: ManuscriptSentence;
  dimmed: boolean;
  onOpenSource?: (sourceId: string) => void;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "py-2 transition-opacity duration-(--dur-state)",
        dimmed ? "opacity-40" : "opacity-100",
        className,
      )}
    >
      <MicroLabel className={cn("block", TEXT[sentence.state])}>
        {EPISTEMIC_LABELS[sentence.state]}
      </MicroLabel>

      {sentence.state === "opinion" && sentence.stance ? (
        <p className="type-small mt-1 text-ink-3">
          your stance: <span className="text-ink-2">“{sentence.stance}”</span>
        </p>
      ) : sentence.sources.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {sentence.sources.map((source) => (
            <li key={source.id}>
              <button
                type="button"
                onClick={() => onOpenSource?.(source.id)}
                className="type-small block text-left text-ink-2 hover:text-ink hover:underline"
              >
                <span data-mono className="type-data block truncate">
                  {source.domain}
                </span>
                <span className="type-small text-ink-3">
                  {source.quality} · {source.age}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-small mt-1 text-ink-3">
          {sentence.state === "unsupported" ? "nothing backs this" : "no source needed"}
        </p>
      )}
    </aside>
  );
}

/** Mobile only. The margin has nowhere to go at 390px, so it becomes a sheet. */
function BottomSheet({
  sentence,
  onClose,
  onOpenSource,
}: {
  sentence: ManuscriptSentence;
  onClose: () => void;
  onOpenSource?: (sourceId: string) => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end md:hidden">
      <button type="button" aria-label="Close" onClick={onClose} className="grow cursor-default bg-ink/20" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Evidence for this sentence"
        className="rounded-t-card border-t border-rule bg-surface px-6 py-4 shadow-pop"
      >
        <p className="type-manuscript mb-3 text-ink">{sentence.text}</p>
        <Margin sentence={sentence} dimmed={false} onOpenSource={onOpenSource} />
        <button type="button" onClick={onClose} className="type-micro mt-4 text-ink-3">
          Close
        </button>
      </div>
    </div>
  );
}
