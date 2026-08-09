import { cn } from "@/lib/format/cn";

/**
 * A row of thin ink bars. No axis, no colour, no tooltip.
 *
 * It is there to show the shape of the distribution the numbers came from —
 * whether the writer is uniformly terse or swings between four words and forty.
 * The precise counts are in the mono figures beside it.
 */
export function SentenceHistogram({ bins, className }: { bins: number[]; className?: string }) {
  const max = Math.max(1, ...bins);
  return (
    <div className={cn("flex h-8 items-end gap-px", className)} aria-hidden>
      {bins.map((count, i) => (
        <span
          key={i}
          className={cn("w-2 rounded-[1px]", count === 0 ? "bg-rule" : "bg-ink")}
          style={{ height: `${Math.max(4, (count / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
