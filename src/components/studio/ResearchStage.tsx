"use client";

import { Button } from "@/components/common/Button";
import { Card, CardSection } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { MicroLabel } from "@/components/common/MicroLabel";
import type { ResearchRecord, Source } from "@/domain/studio/schema";

interface ResearchStageProps {
  research: ResearchRecord | null;
  sources: Source[];
  busy: boolean;
  onRun: () => void;
  onContinue: () => void;
  onOpenSource: (id: string) => void;
}

/**
 * Stage 2, as the user sees it.
 *
 * The two lists are deliberately separate. What a source says and what the
 * model concluded are different kinds of statement, and a screen that mixes
 * them teaches the user to stop telling them apart.
 */
export function ResearchStage({
  research,
  sources,
  busy,
  onRun,
  onContinue,
  onOpenSource,
}: ResearchStageProps) {
  if (!research) {
    return (
      <EmptyState
        action={
          <Button variant="primary" disabled={busy} onClick={onRun}>
            {busy ? "Searching…" : "Research this topic"}
          </Button>
        }
      >
        Nothing retrieved yet. Research searches, stores what it finds as sources, and then reasons
        about them - it never writes the post.
      </EmptyState>
    );
  }

  const fromSource = research.facts.filter((fact) => fact.kind === "from-source");
  const inferred = research.facts.filter((fact) => fact.kind === "inference");

  return (
    <div className="space-y-4">
      {research.insufficient && (
        <Card padding="24" label="Insufficient evidence" className="border-unsupported">
          <p className="type-body reading-column text-ink">{research.insufficientReason}</p>
          <p className="type-small mt-3 text-ink-3">
            Nothing will be written as if there were evidence. Paste a link in the source panel, or go
            back and change the topic.
          </p>
        </Card>
      )}

      <Card padding="24" label={`Findings · ${sources.length} source${sources.length === 1 ? "" : "s"}`}>
        <CardSection label="What the sources say">
          {fromSource.length === 0 ? (
            <p className="type-small text-ink-3">Nothing was established from a source.</p>
          ) : (
            <ul className="space-y-3">
              {fromSource.map((fact, index) => (
                <li key={index}>
                  <p className="type-body text-ink">{fact.claim}</p>
                  <p className="mt-1 flex flex-wrap gap-2">
                    {fact.sourceIds.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onOpenSource(id)}
                        data-mono
                        className="type-micro rounded-control border border-rule-strong px-2 py-1 text-ink-2 hover:bg-surface-sunken hover:text-ink"
                      >
                        {sources.find((source) => source.id === id)?.domain ?? id}
                      </button>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardSection>

        <CardSection label="What the model inferred" className="mt-4">
          {inferred.length === 0 ? (
            <p className="type-small text-ink-3">No inferences drawn.</p>
          ) : (
            <ul className="space-y-2">
              {inferred.map((fact, index) => (
                <li key={index} className="type-body text-ink-2">
                  {fact.claim}
                </li>
              ))}
            </ul>
          )}
        </CardSection>

        <CardSection label="Not established" className="mt-4">
          {research.uncertainties.length === 0 ? (
            <p className="type-small text-ink-3">Nothing flagged as uncertain.</p>
          ) : (
            <ul className="space-y-2">
              {research.uncertainties.map((item, index) => (
                <li key={index} className="type-body text-ink-2">
                  {item}
                </li>
              ))}
            </ul>
          )}
        </CardSection>

        <CardSection label="Freshness" className="mt-4">
          <p className="type-body text-ink-2">
            <span data-mono className="type-data text-ink">
              {research.freshness.assessment}
            </span>{" "}
            - {research.freshness.note}
          </p>
        </CardSection>

        {research.droppedUrls.length > 0 && (
          <CardSection label="Dropped" className="mt-4">
            <p className="type-small text-ink-2">
              {research.droppedUrls.length} URL{research.droppedUrls.length === 1 ? "" : "s"} the model
              produced that no search returned. Dropped and logged, never used as a source.
            </p>
            <ul className="mt-2 space-y-1">
              {research.droppedUrls.map((url) => (
                <li key={url} data-mono className="type-data break-all text-ink-3 line-through">
                  {url}
                </li>
              ))}
            </ul>
          </CardSection>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={busy} onClick={onContinue}>
          Generate angles
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onRun}>
          {busy ? "Working…" : "Research again"}
        </Button>
        <MicroLabel className="self-center">
          Re-running research clears the angles and drafts below it
        </MicroLabel>
      </div>
    </div>
  );
}
