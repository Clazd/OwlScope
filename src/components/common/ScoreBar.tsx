import { cn } from "@/lib/format/cn";

interface ScoreBarProps {
  /** 0–1. Values outside the range are clamped rather than rejected. */
  value: number;
  label?: string;
  /** Show the numeric value in mono to the right. */
  showValue?: boolean;
  className?: string;
}

const SEGMENTS = 10;

/**
 * A ten-segment bar filled in ink. Never coloured — a score is not a claim
 * about truth, so it does not get to use the epistemic palette.
 *
 * Ten discrete segments rather than a continuous fill, because a score of 0.63
 * is not more precise than "six out of ten" and pretending otherwise is a lie
 * the interface would be telling.
 */
export function ScoreBar({ value, label, showValue = true, className }: ScoreBarProps) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const filled = Math.round(clamped * SEGMENTS);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {label && <span className="type-micro text-ink-3 shrink-0">{label}</span>}
      <div
        role="meter"
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Score"}
        className="flex gap-px"
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={cn("h-3 w-2 rounded-[1px]", i < filled ? "bg-ink" : "bg-rule")}
          />
        ))}
      </div>
      {showValue && (
        <span data-mono className="type-data text-ink-2 shrink-0">
          {Math.round(clamped * SEGMENTS)}/{SEGMENTS}
        </span>
      )}
    </div>
  );
}
