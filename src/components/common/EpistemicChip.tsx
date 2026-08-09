import { cn } from "@/lib/format/cn";

export const EPISTEMIC_STATES = ["supported", "partial", "unsupported", "opinion"] as const;
export type EpistemicState = (typeof EPISTEMIC_STATES)[number];

/**
 * The four states, and the four words the user learns in one session. The
 * labels are deliberately plain: this is a claim about truth, not a rating.
 */
export const EPISTEMIC_LABELS: Record<EpistemicState, string> = {
  supported: "Supported",
  partial: "Partly supported",
  unsupported: "Unsupported",
  opinion: "Opinion",
};

export const EPISTEMIC_MEANING: Record<EpistemicState, string> = {
  supported: "A retrieved source backs this claim.",
  partial: "A source touches this claim but does not fully carry it.",
  unsupported: "Nothing retrieved backs this claim. It does not ship as stated.",
  opinion: "A judgement, offered as one. Not a factual claim.",
};

const TONE: Record<EpistemicState, string> = {
  supported: "text-supported bg-supported-tint",
  partial: "text-partial bg-partial-tint",
  unsupported: "text-unsupported bg-unsupported-tint",
  opinion: "text-opinion bg-opinion-tint",
};

const DOT: Record<EpistemicState, string> = {
  supported: "bg-supported",
  partial: "bg-partial",
  unsupported: "bg-unsupported",
  opinion: "bg-opinion",
};

interface EpistemicChipProps {
  state: EpistemicState;
  /** Dot only, for dense rows. The label still reaches screen readers. */
  compact?: boolean;
  className?: string;
}

/**
 * The only coloured chip in the application. When the user sees colour, they
 * are looking at a claim about truth - that is the whole organising idea of
 * the visual system, and this component is where it is enforced.
 */
export function EpistemicChip({ state, compact = false, className }: EpistemicChipProps) {
  const label = EPISTEMIC_LABELS[state];
  return (
    <span
      title={EPISTEMIC_MEANING[state]}
      className={cn(
        "type-micro inline-flex items-center gap-2 whitespace-nowrap rounded-pill px-2 py-1",
        TONE[state],
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 rounded-pill", DOT[state])} />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
