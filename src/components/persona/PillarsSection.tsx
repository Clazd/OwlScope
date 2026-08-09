"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Card, CardSection } from "@/components/common/Card";
import { MicroLabel } from "@/components/common/MicroLabel";
import { RadioRow, TextInput } from "@/components/common/Field";
import { cn } from "@/lib/format/cn";
import { newId } from "@/lib/ids";
import type { Freshness, Pillar } from "@/domain/persona/schema";
import { redistributeWeights, setPillarEnabled, weightsSum } from "@/domain/persona/weights";
import { Section } from "./section-chrome";

interface Props {
  pillars: Pillar[];
  onChange: (pillars: Pillar[]) => void;
}

export function PillarsSection({ pillars, onChange }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const sum = weightsSum(pillars);
  const enabledCount = pillars.filter((p) => p.enabled).length;

  function addPillar() {
    const next: Pillar = {
      id: newId(),
      name: "",
      description: "",
      weight: 0,
      enabled: true,
      freshnessPreference: "balanced",
      subtopics: [],
    };
    onChange(setPillarEnabled([...pillars, next], next.id, true));
  }

  function update(id: string, changes: Partial<Pillar>) {
    onChange(pillars.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }

  return (
    <Section
      id="pillars"
      title="Pillars"
      intro={
        // Stated here because the number looks like a quota and is not one.
        "Weighted interest areas. Weights are soft pressure on what gets looked at, not a quota — if the best idea today sits in a 10% pillar, that idea still wins."
      }
      action={<Button onClick={addPillar}>Add pillar</Button>}
    >
      <Card padding="24">
        <div className="mb-4 flex items-center justify-between">
          <MicroLabel strong>
            {enabledCount} enabled
          </MicroLabel>
          <MicroLabel strong>total {sum}</MicroLabel>
        </div>

        {pillars.length === 0 && (
          <p className="type-small text-ink-3">
            No pillars yet. Add the two or three things you actually want to write about.
          </p>
        )}

        {pillars.map((pillar) => (
          <CardSection key={pillar.id} className="py-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={pillar.enabled}
                aria-label={`Enable ${pillar.name || "pillar"}`}
                onChange={(e) => onChange(setPillarEnabled(pillars, pillar.id, e.target.checked))}
                className="accent-ink size-4 shrink-0"
              />
              <TextInput
                value={pillar.name}
                onChange={(e) => update(pillar.id, { name: e.target.value })}
                placeholder="Pillar name"
                className={cn("grow", !pillar.enabled && "text-ink-3")}
              />
              <span data-mono className="type-data w-12 shrink-0 text-right text-ink-2">
                {pillar.weight}%
              </span>
              <button
                type="button"
                onClick={() => setExpanded(expanded === pillar.id ? null : pillar.id)}
                aria-expanded={expanded === pillar.id}
                className="type-micro shrink-0 rounded-control px-2 py-1 text-ink-3 hover:text-ink"
              >
                {expanded === pillar.id ? "Less" : "More"}
              </button>
            </div>

            {/*
              The weight control is a range input rather than a bespoke drag
              handle: it is keyboard-operable for free, and redistribution runs
              on every change so the total is never briefly wrong.
            */}
            <input
              type="range"
              min={0}
              max={100}
              value={pillar.weight}
              disabled={!pillar.enabled}
              aria-label={`${pillar.name || "Pillar"} weight`}
              onChange={(e) => onChange(redistributeWeights(pillars, pillar.id, Number(e.target.value)))}
              className="accent-ink mt-2 w-full disabled:opacity-40"
            />

            {expanded === pillar.id && (
              <div className="mt-3 space-y-3">
                <TextInput
                  value={pillar.description}
                  onChange={(e) => update(pillar.id, { description: e.target.value })}
                  placeholder="What this pillar covers"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <MicroLabel strong>freshness</MicroLabel>
                  <RadioRow<Freshness>
                    name="Freshness preference"
                    value={pillar.freshnessPreference}
                    onChange={(freshnessPreference) => update(pillar.id, { freshnessPreference })}
                    options={[
                      { value: "fresh", label: "Fresh" },
                      { value: "balanced", label: "Balanced" },
                      { value: "evergreen", label: "Evergreen" },
                    ]}
                  />
                </div>
                <div>
                  <MicroLabel strong className="mb-2 block">
                    subtopics
                  </MicroLabel>
                  <TextInput
                    value={pillar.subtopics.join(", ")}
                    onChange={(e) =>
                      update(pillar.id, {
                        subtopics: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="open weights, evaluation, agents"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onChange(pillars.filter((p) => p.id !== pillar.id))}
                  className="type-small text-unsupported hover:underline"
                >
                  Remove this pillar
                </button>
              </div>
            )}
          </CardSection>
        ))}
      </Card>
    </Section>
  );
}
