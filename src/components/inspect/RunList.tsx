"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { Card, CardSection } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { MicroLabel } from "@/components/common/MicroLabel";
import { PipelineRail, type StageState } from "@/components/common/PipelineRail";
import { cn } from "@/lib/format/cn";
import { formatMs, formatStamp, formatTokens } from "@/lib/format/display";
import { formatCost } from "@/services/ai/pricing";
import type { Run, RunStage } from "@/services/runs/schema";

const STAGE_STATE: Record<RunStage["status"], StageState> = {
  done: "done",
  failed: "failed",
  skipped: "skipped",
  running: "active",
};

/**
 * The URL fragment, subscribed to as the external state it is. The server has
 * no fragment to render, so the snapshot there is empty and the client fills it
 * in on hydration.
 */
function useHash(): string {
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("hashchange", notify);
    return () => window.removeEventListener("hashchange", notify);
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash.slice(1),
    () => "",
  );
}

export function RunList({ runs }: { runs: Run[] }) {
  const hash = useHash();
  // Null means "no choice made yet, follow the fragment". Once the user clicks,
  // their choice wins until the fragment changes under them.
  const [chosen, setChosen] = useState<{ id: string | null } | null>(null);
  const openId = chosen ? chosen.id : hash || null;
  const setOpenId = (id: string | null) => setChosen({ id });

  if (runs.length === 0) {
    return (
      <EmptyState>
        No runs recorded yet. Every pipeline run writes a file to /data/runs, and this is where you
        read it back - the exact prompt, the raw response, what it parsed to, and what it cost.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      {runs.map((run) => (
        <RunRow key={run.id} run={run} open={openId === run.id} onToggle={() => setOpenId(openId === run.id ? null : run.id)} />
      ))}
    </div>
  );
}

function RunRow({ run, open, onToggle }: { run: Run; open: boolean; onToggle: () => void }) {
  return (
    <Card id={run.id} className="scroll-mt-4">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start justify-between gap-4 text-left">
        <div className="min-w-0">
          <p className="type-body-strong text-ink">
            {run.kind}
            <span className={cn("ml-2", run.status === "failed" ? "text-unsupported" : "text-ink-3")}>{run.status}</span>
          </p>
          <p data-mono className="type-data mt-1 text-ink-3">
            {formatStamp(run.startedAt)} · {run.stages.length} stage{run.stages.length === 1 ? "" : "s"}
            {run.sandbox ? " · sandbox" : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p data-mono className="type-data text-ink-2">
            {formatTokens(run.totalTokensIn)} in / {formatTokens(run.totalTokensOut)} out
          </p>
          <p data-mono className="type-data text-ink-3">
            {run.sandbox ? "$0.00" : formatCost(run.totalCost)}
          </p>
        </div>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <CardSection label="Run">
            <dl data-mono className="type-data grid grid-cols-[130px_1fr] gap-x-4 gap-y-1 text-ink-2">
              <dt className="text-ink-3">id</dt>
              <dd className="break-all">{run.id}</dd>
              <dt className="text-ink-3">persona version</dt>
              <dd>{run.personaVersion}</dd>
              <dt className="text-ink-3">started</dt>
              <dd>{run.startedAt}</dd>
              <dt className="text-ink-3">finished</dt>
              <dd>{run.finishedAt ?? "-"}</dd>
              <dt className="text-ink-3">idempotency key</dt>
              <dd className="break-all">{run.idempotencyKey ?? "-"}</dd>
            </dl>
          </CardSection>

          {run.stages.length > 0 && (
            <CardSection label="Stages">
              <PipelineRail
                stages={run.stages.map((stage) => ({
                  name: stage.stage,
                  state: STAGE_STATE[stage.status],
                  detail: `${formatMs(stage.latencyMs)} · ${stage.tokensIn}/${stage.tokensOut}`,
                }))}
              />
            </CardSection>
          )}

          {run.stages.map((stage, i) => (
            <StageDetail key={`${stage.stage}-${i}`} stage={stage} />
          ))}
        </div>
      )}
    </Card>
  );
}

function StageDetail({ stage }: { stage: RunStage }) {
  return (
    <CardSection label={`${stage.stage} - ${stage.status}`}>
      <dl data-mono className="type-data mb-3 grid grid-cols-[130px_1fr] gap-x-4 gap-y-1 text-ink-2">
        <dt className="text-ink-3">model</dt>
        <dd>{stage.model}</dd>
        <dt className="text-ink-3">latency</dt>
        <dd>{formatMs(stage.latencyMs)}</dd>
        <dt className="text-ink-3">tokens</dt>
        <dd>
          {stage.tokensIn} in / {stage.tokensOut} out
        </dd>
        {stage.errorCategory && (
          <>
            <dt className="text-ink-3">error</dt>
            <dd className="text-unsupported">{stage.errorCategory}</dd>
          </>
        )}
      </dl>

      {stage.validationError && (
        <Block label="Validation error" tone="failure">
          {stage.validationError}
        </Block>
      )}
      <Block label="Prompt">{stage.prompt || "(empty)"}</Block>
      <Block label="Raw response">{stage.rawResponse || "(empty)"}</Block>
      <Block label="Parsed">{stage.parsed === null ? "(none)" : JSON.stringify(stage.parsed, null, 2)}</Block>
    </CardSection>
  );
}

function Block({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "failure" }) {
  return (
    <div className="mb-3 last:mb-0">
      <MicroLabel className="mb-1 block">{label}</MicroLabel>
      <pre
        data-mono
        className={cn(
          "type-data max-h-[280px] overflow-auto whitespace-pre-wrap break-words rounded-control bg-surface-sunken p-3",
          tone === "failure" ? "text-unsupported" : "text-ink-2",
        )}
      >
        {children}
      </pre>
    </div>
  );
}
