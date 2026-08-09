"use client";

import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { MicroLabel } from "@/components/common/MicroLabel";
import type { Angle, AnglePick } from "@/domain/studio/schema";
import { cn } from "@/lib/format/cn";

interface AnglesStageProps {
  angles: Angle[];
  pick: AnglePick | null;
  selectedId: string | null;
  busy: boolean;
  onGenerate: () => void;
  onAskAi: () => void;
  onSelect: (id: string) => void;
  onContinue: () => void;
}

const RISK_TEXT: Record<Angle["noveltyRisk"], string> = {
  low: "text-ink-3",
  medium: "text-partial",
  high: "text-unsupported",
};

/**
 * Stage 3. Pick the argument, not the wording.
 *
 * Novelty risk is the one place colour appears in this list, because "you have
 * already said this" is a claim about the archive rather than a rating - it is
 * the memory rule showing its work before anything is written.
 */
export function AnglesStage({
  angles,
  pick,
  selectedId,
  busy,
  onGenerate,
  onAskAi,
  onSelect,
  onContinue,
}: AnglesStageProps) {
  if (angles.length === 0) {
    return (
      <EmptyState
        action={
          <Button variant="primary" disabled={busy} onClick={onGenerate}>
            {busy ? "Thinking…" : "Generate angles"}
          </Button>
        }
      >
        Four to six angles that genuinely disagree about what matters here - not six rewordings of one
        thesis.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {pick && (
        <Card label="The AI picked" padding="24">
          <p className="type-body reading-column text-ink">{pick.reasoning}</p>
        </Card>
      )}

      <ul className="space-y-3">
        {angles.map((angle) => {
          const selected = angle.id === selectedId;
          return (
            <li key={angle.id}>
              <button
                type="button"
                onClick={() => onSelect(angle.id)}
                aria-pressed={selected}
                className={cn(
                  "block w-full rounded-card border bg-surface p-4 text-left",
                  "transition-colors duration-(--dur-state) ease-(--ease)",
                  selected ? "border-ink" : "border-rule hover:bg-surface-sunken",
                )}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <MicroLabel strong>{angle.kind}</MicroLabel>
                  <span data-mono className={cn("type-micro", RISK_TEXT[angle.noveltyRisk])}>
                    novelty risk {angle.noveltyRisk}
                  </span>
                </div>
                <p className="type-body-strong mt-2 text-ink">{angle.thesis}</p>
                <p className="type-small mt-2 text-ink-2">{angle.whyItFits}</p>
                {angle.evidenceNeeded.length > 0 && (
                  <p className="type-small mt-2 text-ink-3">
                    Needs: {angle.evidenceNeeded.join("; ")}
                  </p>
                )}
                {angle.noveltyNote && (
                  <p className="type-small mt-1 text-ink-3">{angle.noveltyNote}</p>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy || !selectedId} onClick={onContinue}>
          Write drafts
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onAskAi}>
          Let the AI pick
        </Button>
        <Button variant="quiet" disabled={busy} onClick={onGenerate}>
          {busy ? "Working…" : "Regenerate"}
        </Button>
      </div>
    </div>
  );
}
