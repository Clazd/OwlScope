"use client";

import { STUDIO_STAGES, type StudioSession, type StudioStage, type StudioStageState } from "@/domain/studio/schema";
import { cn } from "@/lib/format/cn";
import { MicroLabel } from "@/components/common/MicroLabel";

const LABELS: Record<StudioStage, string> = {
  topic: "Topic",
  research: "Research",
  angles: "Angles",
  drafts: "Drafts",
  critique: "Critique",
  final: "Final",
};

const MARK: Record<StudioStageState, string> = {
  pending: "border-rule text-ink-3",
  active: "border-ink bg-ink text-bg stage-pulse",
  done: "border-ink bg-ink text-bg",
  failed: "border-unsupported bg-unsupported text-bg",
  skipped: "border-rule-strong text-ink-3",
};

const TEXT: Record<StudioStageState, string> = {
  pending: "text-ink-3",
  active: "text-ink",
  done: "text-ink-2",
  failed: "text-unsupported",
  skipped: "text-ink-3",
};

const GLYPH: Record<StudioStageState, string> = {
  pending: "○",
  active: "●",
  done: "✓",
  failed: "!",
  skipped: "–",
};

interface StageRailProps {
  session: StudioSession;
  onGoTo: (stage: StudioStage) => void;
  busy: boolean;
}

/**
 * The stage rail. Six states, one glyph each, and the only ambient animation
 * in the product on the active one.
 *
 * A completed stage is a button; a pending one is not. Clicking back returns to
 * that stage without destroying later work — the pipeline only invalidates
 * downstream output when a stage actually re-runs.
 */
export function StageRail({ session, onGoTo, busy }: StageRailProps) {
  return (
    <nav aria-label="Pipeline stages" className="min-w-0 max-w-full overflow-hidden [contain:layout_paint_inline-size] lg:overflow-visible lg:[contain:none]">
      <ol className="flex w-full min-w-0 max-w-full gap-2 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:pb-0">
        {STUDIO_STAGES.map((stage, index) => {
          const state = session.stageStates[stage];
          const reachable = state !== "pending" && !busy;
          const current = session.stage === stage;

          return (
            <li key={stage} className="shrink-0 lg:shrink">
              <button
                type="button"
                disabled={!reachable}
                aria-current={current ? "step" : undefined}
                onClick={() => onGoTo(stage)}
                className={cn(
                  "flex min-w-[132px] items-center gap-3 rounded-control px-2 py-2 text-left lg:w-full lg:min-w-0",
                  "transition-colors duration-(--dur-state) ease-(--ease)",
                  reachable ? "hover:bg-surface-sunken" : "cursor-default",
                  current && "bg-surface-sunken",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "type-micro flex size-4 shrink-0 items-center justify-center rounded-pill border",
                    MARK[state],
                  )}
                >
                  {GLYPH[state]}
                </span>
                <span className={cn("type-body grow", TEXT[state])}>{LABELS[stage]}</span>
                <span data-mono className="type-micro text-ink-3">
                  {index + 1}
                </span>
                <span className="sr-only">{state}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface RunSummaryProps {
  runIds: string[];
  onInspect: () => void;
}

/** The run's cost, in mono, where the brief's sketch puts it. */
export function RunSummary({ runIds, onInspect }: RunSummaryProps) {
  const latest = runIds[runIds.length - 1];
  return (
    <div className="space-y-2 border-t border-rule pt-3">
      <MicroLabel className="block">{latest ? `RUN ${latest.slice(-4)}` : "NO RUN YET"}</MicroLabel>
      <p data-mono className="type-data text-ink-3">
        {runIds.length} run{runIds.length === 1 ? "" : "s"} this session
      </p>
      <button
        type="button"
        onClick={onInspect}
        className="type-small rounded-control border border-rule-strong px-3 py-1 text-ink-2 hover:bg-surface-sunken hover:text-ink"
      >
        Inspect
      </button>
    </div>
  );
}
