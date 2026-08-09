"use client";

import { Button } from "@/components/common/Button";
import { Card, CardSection } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { MicroLabel } from "@/components/common/MicroLabel";
import { ScoreBar } from "@/components/common/ScoreBar";
import type { CritiqueRecord, GateReport, StudioDraft, ValidationOutput } from "@/domain/studio/schema";
import { cn } from "@/lib/format/cn";

interface CritiqueStageProps {
  draft: StudioDraft | null;
  validation: ValidationOutput | null;
  critique: CritiqueRecord | null;
  gates: GateReport | null;
  busy: boolean;
  onRun: () => void;
  onContinue: () => void;
  onFocusSentence: (id: string) => void;
}

const SEVERITY_TEXT = {
  block: "text-unsupported",
  warn: "text-partial",
  note: "text-ink-3",
} as const;

const LEVEL_TEXT = {
  low: "text-supported",
  medium: "text-partial",
  high: "text-unsupported",
} as const;

const FIT_TEXT = {
  strong: "text-supported",
  acceptable: "text-partial",
  weak: "text-unsupported",
} as const;

/**
 * Stage 5. Two passes, reported separately because they are separate passes.
 *
 * Every finding links to its sentence; clicking one scrolls the manuscript to
 * it and highlights it. A critique that cannot be traced to a specific line is
 * a critique nobody acts on.
 */
export function CritiqueStage({
  draft,
  validation,
  critique,
  gates,
  busy,
  onRun,
  onContinue,
  onFocusSentence,
}: CritiqueStageProps) {
  if (!draft) {
    return <EmptyState>Select a draft first. The critic works on one post, not on three.</EmptyState>;
  }

  if (!validation || !critique) {
    return (
      <EmptyState
        action={
          <Button variant="primary" disabled={busy} onClick={onRun}>
            {busy ? "Checking…" : "Validate and critique"}
          </Button>
        }
      >
        Fact validation runs per sentence against the stored sources. The style critic then reports on
        the result — it never rewrites the post.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <Card padding="24" label="Verdict">
        <div className="grid gap-4 sm:grid-cols-2">
          <Metric label="Persona fit" value={critique.personaFit} className={FIT_TEXT[critique.personaFit]} />
          <Metric label="Genericness" value={critique.genericness} className={LEVEL_TEXT[critique.genericness]} />
          <Metric label="Factual risk" value={critique.factualRisk} className={LEVEL_TEXT[critique.factualRisk]} />
          <Metric
            label="Similarity risk"
            value={critique.similarityRisk}
            className={LEVEL_TEXT[critique.similarityRisk]}
          />
        </div>
        <div className="mt-4 border-t border-rule pt-4">
          {draft.fingerprintScored ? (
            <>
              <ScoreBar label="FINGERPRINT" value={critique.fingerprintScore / 100} showValue={false} />
              <p data-mono className="type-data mt-2 text-ink-3">
                {critique.fingerprintScore}/100 · recommendation:{" "}
                <span className="text-ink">{critique.recommendation}</span>
              </p>
            </>
          ) : (
            <p data-mono className="type-data text-ink-3">
              fingerprint not measured — analyse your samples in Brain · recommendation:{" "}
              <span className="text-ink">{critique.recommendation}</span>
            </p>
          )}
        </div>
      </Card>

      <Card padding="24" label={`Fact validation · ${validation.canPublish ? "clear" : "blocked"}`}>
        <ul className="space-y-2">
          {validation.sentences.map((verdict) => (
            <li key={verdict.id}>
              <button
                type="button"
                onClick={() => onFocusSentence(verdict.id)}
                className="block w-full rounded-control px-2 py-1 text-left hover:bg-surface-sunken"
              >
                <span className="flex flex-wrap items-baseline gap-2">
                  <span data-mono className="type-micro text-ink-3">
                    {verdict.id}
                  </span>
                  <span
                    data-mono
                    className={cn(
                      "type-micro",
                      verdict.support === "supported"
                        ? "text-supported"
                        : verdict.support === "partial"
                          ? "text-partial"
                          : "text-unsupported",
                    )}
                  >
                    {verdict.support}
                  </span>
                  {verdict.sourceIds.length > 0 && (
                    <span data-mono className="type-micro text-ink-3">
                      {verdict.sourceIds.join(" ")}
                    </span>
                  )}
                </span>
                {verdict.notes && <span className="type-small mt-1 block text-ink-2">{verdict.notes}</span>}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card padding="24" label={`Critique · ${critique.issues.length} finding${critique.issues.length === 1 ? "" : "s"}`}>
        {critique.issues.length === 0 ? (
          <p className="type-small text-ink-3">The critic found nothing worth reporting.</p>
        ) : (
          <ul className="space-y-3">
            {critique.issues.map((issue, index) => (
              <li key={index}>
                <button
                  type="button"
                  disabled={!issue.sentenceId}
                  onClick={() => issue.sentenceId && onFocusSentence(issue.sentenceId)}
                  className={cn(
                    "block w-full rounded-control px-2 py-1 text-left",
                    issue.sentenceId ? "hover:bg-surface-sunken" : "cursor-default",
                  )}
                >
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span data-mono className={cn("type-micro", SEVERITY_TEXT[issue.severity])}>
                      {issue.severity}
                    </span>
                    <span data-mono className="type-micro text-ink-3">
                      {issue.type}
                    </span>
                    {issue.sentenceId && (
                      <span data-mono className="type-micro text-ink-3">
                        {issue.sentenceId}
                      </span>
                    )}
                  </span>
                  <span className="type-body mt-1 block text-ink">{issue.detail}</span>
                  {issue.suggestion && (
                    <span className="type-small mt-1 block text-ink-2">{issue.suggestion}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {gates && (gates.blocking.length > 0 || gates.warnings.length > 0) && (
        <Card padding="24" label="Gates">
          {gates.blocking.length > 0 && (
            <CardSection label="Blocking">
              <ul className="space-y-2">
                {gates.blocking.map((finding) => (
                  <li key={finding.id} className="type-body text-unsupported">
                    {finding.message}
                  </li>
                ))}
              </ul>
            </CardSection>
          )}
          {gates.warnings.length > 0 && (
            <CardSection label="Warnings" className={gates.blocking.length > 0 ? "mt-4" : ""}>
              <ul className="space-y-2">
                {gates.warnings.map((finding) => (
                  <li key={finding.id} className="type-body text-ink-2">
                    {finding.message}
                  </li>
                ))}
              </ul>
            </CardSection>
          )}
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={onContinue}>
          Finalise
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onRun}>
          {busy ? "Working…" : "Re-check"}
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div>
      <MicroLabel className="block">{label}</MicroLabel>
      <span data-mono className={cn("type-data", className)}>
        {value}
      </span>
    </div>
  );
}
