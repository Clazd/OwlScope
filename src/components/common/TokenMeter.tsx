import { cn } from "@/lib/format/cn";
import { formatTokens } from "@/lib/format/display";

interface TokenMeterProps {
  used: number;
  budget: number;
  className?: string;
  /** Hide the figures when space is tight, e.g. the collapsed rail. */
  compact?: boolean;
}

/**
 * Today's spend against the daily budget. A thin bar and mono figures.
 *
 * The bar is ink until 80%, then --partial. That is the one place in the
 * product where a saturated colour is not describing a claim, and it earns the
 * exception by meaning the same thing it always means: proceed with care.
 */
export function TokenMeter({ used, budget, className, compact = false }: TokenMeterProps) {
  const fraction = budget > 0 ? Math.min(1, used / budget) : 0;
  const percent = Math.round(fraction * 100);
  const warn = fraction >= 0.8;

  return (
    <div className={cn("w-full", className)}>
      <div
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Token budget used today"
        className="h-1 w-full overflow-hidden rounded-pill bg-rule"
      >
        <div
          className={cn("h-full transition-[width] duration-(--dur-panel) ease-(--ease)", warn ? "bg-partial" : "bg-ink")}
          style={{ width: `${percent}%` }}
        />
      </div>
      {!compact && (
        <p data-mono className="type-micro text-ink-3 mt-2 flex justify-between">
          <span>
            {formatTokens(used)}/{formatTokens(budget)}
          </span>
          <span>{percent}%</span>
        </p>
      )}
    </div>
  );
}
