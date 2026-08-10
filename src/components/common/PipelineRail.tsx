import { cn } from "@/lib/format/cn";
import { formatMs } from "@/lib/format/display";

export type StageState = "pending" | "active" | "done" | "failed" | "skipped";

export interface PipelineStage {
  name: string;
  state: StageState;
  /** Mono detail on the right: latency, token count, a reason for skipping. */
  detail?: string;
  latencyMs?: number;
}

interface PipelineRailProps {
  stages: PipelineStage[];
  className?: string;
}

const MARK: Record<StageState, string> = {
  pending: "border-rule bg-transparent",
  active: "border-ink bg-ink stage-pulse",
  done: "border-ink bg-ink",
  failed: "border-unsupported bg-unsupported",
  skipped: "border-rule-strong bg-transparent",
};

const TEXT: Record<StageState, string> = {
  pending: "text-ink-3",
  active: "text-ink",
  done: "text-ink-2",
  failed: "text-ink",
  skipped: "text-ink-3 line-through",
};

/**
 * The vertical run of stages. The active stage carries the only ambient
 * animation in the product - a 1.6s opacity pulse - and nothing else on any
 * screen moves on its own.
 */
export function PipelineRail({ stages, className }: PipelineRailProps) {
  return (
    <ol className={cn("relative", className)}>
      {stages.map((stage, i) => {
        const last = i === stages.length - 1;
        const detail = stage.detail ?? (stage.latencyMs !== undefined ? formatMs(stage.latencyMs) : null);
        return (
          <li key={stage.name} aria-label={`${stage.name}: ${stage.state}`} aria-current={stage.state === "active" ? "step" : undefined} className="relative flex gap-3 pb-4 last:pb-0">
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className={cn("mt-1 size-2 shrink-0 rounded-pill border", MARK[stage.state])}
              />
              {!last && <span aria-hidden className="mt-1 w-px grow bg-rule" />}
            </div>
            <div className="flex min-w-0 grow flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <span className={cn("type-body shrink-0", TEXT[stage.state])}>{stage.name}</span>
              {detail && (
                <span data-mono className="type-data min-w-0 text-ink-3 sm:max-w-[55%] sm:text-right truncate" title={detail}>
                  {detail}
                </span>
              )}
            </div>
            <span className="sr-only">{stage.state}</span>
          </li>
        );
      })}
    </ol>
  );
}
