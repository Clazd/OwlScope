"use client";

import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { MicroLabel } from "@/components/common/MicroLabel";
import type { StudioDraft } from "@/domain/studio/schema";
import { cn } from "@/lib/format/cn";

interface DraftsStageProps {
  drafts: StudioDraft[];
  selectedId: string | null;
  busy: boolean;
  onGenerate: () => void;
  onSelect: (id: string) => void;
  onRevise: (id: string, action: string) => void;
  onContinue: () => void;
}

/** The revision actions, in the order the brief lists them. */
const ACTIONS: Array<{ id: string; label: string }> = [
  { id: "shorten", label: "Shorten" },
  { id: "expand", label: "Expand" },
  { id: "more-technical", label: "More technical" },
  { id: "more-casual", label: "More casual" },
  { id: "more-opinionated", label: "More opinionated" },
  { id: "less-ai", label: "Less AI" },
  { id: "remove-cliche", label: "Remove cliché" },
  { id: "rewrite", label: "Rewrite" },
  { id: "regenerate", label: "Redo" },
];

const RISK_TEXT = {
  low: "text-ink-3",
  medium: "text-partial",
  high: "text-unsupported",
} as const;

/**
 * Stage 4. Each card shows what it costs to trust: length, tone, how many
 * factual claims it makes, how well the sources cover them, whether it repeats
 * something already posted, and how closely it matches the voice.
 */
export function DraftsStage({
  drafts,
  selectedId,
  busy,
  onGenerate,
  onSelect,
  onRevise,
  onContinue,
}: DraftsStageProps) {
  if (drafts.length === 0) {
    return (
      <EmptyState
        action={
          <Button variant="primary" disabled={busy} onClick={onGenerate}>
            {busy ? "Writing…" : "Write drafts"}
          </Button>
        }
      >
        Up to three substantially different drafts, each stored as a sentence array so every claim can
        be checked on its own.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <MicroLabel strong>Drafts</MicroLabel>
        <span data-mono className="type-data text-ink-3">
          {drafts.length} of {drafts.length}
        </span>
      </div>

      <ul className="space-y-4">
        {drafts.map((draft) => {
          const selected = draft.id === selectedId;
          const facts = draft.sentences.filter((s) => s.claimType === "fact").length;
          const opinions = draft.sentences.filter((s) => s.claimType === "opinion").length;
          const covered = draft.sentences.filter((s) => s.sourceIds.length > 0).length;

          return (
            <li
              key={draft.id}
              className={cn(
                "rounded-card border bg-surface p-4",
                selected ? "border-ink" : "border-rule",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <span className="type-micro flex items-center gap-2 text-ink-2">
                  <span aria-hidden className={selected ? "text-ink" : "text-ink-3"}>
                    {selected ? "●" : "○"}
                  </span>
                  {selected ? "selected" : "not selected"}
                </span>
                <span data-mono className="type-data text-ink-3">
                  {draft.characterCount} ch · FIT{" "}
                  {/* A dash, not a zero: no fingerprint means unmeasured, not bad. */}
                  {draft.fingerprintScored ? draft.fingerprintScore : "—"}
                </span>
              </div>

              <p className="type-manuscript mt-3 whitespace-pre-wrap text-ink">{draft.text}</p>

              <p data-mono className="type-data mt-3 flex flex-wrap gap-x-4 gap-y-1 text-ink-3">
                <span>
                  {facts} fact{facts === 1 ? "" : "s"} · {opinions} opinion{opinions === 1 ? "" : "s"}
                </span>
                <span>
                  {covered}/{draft.sentences.length} cited
                </span>
                {draft.similarity && (
                  <span className={RISK_TEXT[draft.similarity.risk]}>sim {draft.similarity.risk}</span>
                )}
                {draft.toneTags.length > 0 && <span>{draft.toneTags.join(" · ")}</span>}
              </p>

              {(draft.warnings.length > 0 || draft.fingerprintDeviations.length > 0) && (
                <ul className="mt-3 space-y-1 border-t border-rule pt-3">
                  {draft.warnings.map((warning, index) => (
                    <li key={`w${index}`} className="type-small text-unsupported">
                      {warning}
                    </li>
                  ))}
                  {draft.fingerprintDeviations.slice(0, 3).map((deviation, index) => (
                    <li key={`d${index}`} className="type-small text-ink-3">
                      {deviation}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap gap-2 border-t border-rule pt-3">
                <Button
                  variant={selected ? "secondary" : "primary"}
                  disabled={busy}
                  onClick={() => onSelect(draft.id)}
                >
                  {selected ? "Selected" : "Select"}
                </Button>
                {ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onRevise(draft.id, action.id)}
                    className={cn(
                      "type-small rounded-control px-2 py-1 text-ink-2",
                      "hover:bg-surface-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40",
                    )}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy || !selectedId} onClick={onContinue}>
          Check the facts
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onGenerate}>
          {busy ? "Working…" : "Write three more"}
        </Button>
      </div>
    </div>
  );
}
