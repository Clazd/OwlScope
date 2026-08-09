import { cn } from "@/lib/format/cn";

interface StageSpinnerProps {
  /** What is happening right now, named. "Checking sources", not "Loading". */
  stage: string;
  className?: string;
}

/**
 * Named stage text plus the pulse. Never a percentage.
 *
 * A progress bar would have to invent a denominator, and an invented number is
 * the same failure as an invented source - smaller, but the same kind.
 */
export function StageSpinner({ stage, className }: StageSpinnerProps) {
  return (
    <p role="status" aria-live="polite" className={cn("flex items-center gap-3", className)}>
      <span aria-hidden className="stage-pulse size-2 rounded-pill bg-ink" />
      <span className="type-body text-ink-2">{stage}</span>
    </p>
  );
}
