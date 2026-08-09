"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Field, RadioRow, TextInput } from "@/components/common/Field";
import { MicroLabel } from "@/components/common/MicroLabel";
import type { Pillar } from "@/domain/persona/schema";
import type { BoundaryCheck, Topic, TopicFreshness } from "@/domain/studio/schema";

interface TopicStageProps {
  topic: Topic | null;
  boundary: BoundaryCheck | null;
  pillars: Pillar[];
  busy: boolean;
  onStart: (input: { title: string; summary: string; context: string; pillarId: string | null; freshness: TopicFreshness }) => void;
  onResearch: () => void;
  onReset: () => void;
}

/**
 * Stage 1. Radar does not exist yet, so topics come from a text box.
 *
 * The boundary check runs the moment a topic is submitted and before anything
 * else, so a blocked topic is refused here with a plain explanation rather than
 * quietly producing a post nobody wanted.
 */
export function TopicStage({
  topic,
  boundary,
  pillars,
  busy,
  onStart,
  onResearch,
  onReset,
}: TopicStageProps) {
  const [title, setTitle] = useState(topic?.title ?? "");
  const [summary, setSummary] = useState(topic?.summary ?? "");
  const [context, setContext] = useState(topic?.context ?? "");
  const [freshness, setFreshness] = useState<TopicFreshness>(topic?.freshness ?? "current");
  const [pillarId, setPillarId] = useState<string | null>(topic?.pillarId ?? null);

  if (boundary?.blocked) {
    return (
      <Card padding="24" label="Blocked">
        <h2 className="type-h2 text-ink">This topic is off limits.</h2>
        <p className="type-body reading-column mt-3 text-ink-2">{boundary.explanation}</p>
        <p className="type-small mt-4 text-ink-3">
          No research ran and no model was asked to write anything.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={onReset}>
            Try a different topic
          </Button>
        </div>
      </Card>
    );
  }

  if (topic) {
    return (
      <Card padding="24" label="Topic">
        <h2 className="type-h2 text-ink">{topic.title}</h2>
        {topic.summary && <p className="type-body mt-2 text-ink-2">{topic.summary}</p>}
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-rule pt-4 sm:grid-cols-4">
          <Fact label="Origin" value={topic.sourceType} />
          <Fact label="Freshness" value={topic.freshness} />
          <Fact label="Pillar" value={pillars.find((p) => p.id === topic.pillarId)?.name ?? "none"} />
          <Fact label="Status" value={topic.status} />
        </dl>
        {topic.context && (
          <div className="mt-4 border-t border-rule pt-4">
            <MicroLabel className="mb-1 block">What you already know</MicroLabel>
            <p className="type-body text-ink-2">{topic.context}</p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={onResearch}>
            {busy ? "Researching…" : "Research this"}
          </Button>
          <Button variant="quiet" disabled={busy} onClick={onReset}>
            Start over
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="24" label="New topic">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return;
          onStart({ title, summary, context, pillarId, freshness });
        }}
      >
        <Field label="What is worth saying something about?">
          <TextInput
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Agent frameworks and long-running tasks"
            autoFocus
          />
        </Field>

        <Field label="Summary" hint="Optional. One line on what the topic actually is.">
          <TextInput value={summary} onChange={(event) => setSummary(event.target.value)} />
        </Field>

        <Field
          label="What you already know"
          hint="Passed to research as context. It is never treated as evidence."
        >
          <TextInput value={context} onChange={(event) => setContext(event.target.value)} />
        </Field>

        <Field label="Freshness" hint="A current topic that finds no evidence will not be written.">
          <RadioRow
            name="Freshness"
            value={freshness}
            onChange={setFreshness}
            options={[
              { value: "current", label: "Current" },
              { value: "evergreen", label: "Evergreen" },
            ]}
          />
        </Field>

        {pillars.length > 0 && (
          <Field label="Pillar" hint="Optional. Weights are pressure on selection, not a quota.">
            <div className="flex flex-wrap gap-2">
              <PillarChip label="None" active={pillarId === null} onClick={() => setPillarId(null)} />
              {pillars
                .filter((pillar) => pillar.enabled)
                .map((pillar) => (
                  <PillarChip
                    key={pillar.id}
                    label={`${pillar.name} ${pillar.weight}%`}
                    active={pillarId === pillar.id}
                    onClick={() => setPillarId(pillar.id)}
                  />
                ))}
            </div>
          </Field>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
            {busy ? "Checking boundaries…" : "Start"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <MicroLabel className="block">{label}</MicroLabel>
      <span data-mono className="type-data text-ink-2">
        {value}
      </span>
    </div>
  );
}

function PillarChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? "type-small rounded-pill border border-ink bg-ink px-3 py-1 text-bg"
          : "type-small rounded-pill border border-rule-strong bg-surface px-3 py-1 text-ink-2 hover:bg-surface-sunken hover:text-ink"
      }
    >
      {label}
    </button>
  );
}
