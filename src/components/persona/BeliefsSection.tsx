"use client";

import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { RadioRow, Toggle } from "@/components/common/Field";
import { MicroLabel } from "@/components/common/MicroLabel";
import { newId } from "@/lib/ids";
import type { Belief, BeliefStrength, Pillar } from "@/domain/persona/schema";
import { ListRow, Section } from "./section-chrome";

interface Props {
  beliefs: Belief[];
  pillars: Pillar[];
  onChange: (beliefs: Belief[]) => void;
}

export function BeliefsSection({ beliefs, pillars, onChange }: Props) {
  function update(id: string, changes: Partial<Belief>) {
    onChange(beliefs.map((b) => (b.id === id ? { ...b, ...changes } : b)));
  }

  return (
    <Section
      id="beliefs"
      title="Beliefs"
      intro="Stances the writer may argue from. It may never invent a new permanent belief - if it is not here, it does not get asserted as a position."
      action={
        <Button
          onClick={() =>
            onChange([
              ...beliefs,
              { id: newId(), statement: "", strength: "moderate", pillarId: null, enabled: true },
            ])
          }
        >
          Add belief
        </Button>
      }
    >
      <Card padding="24">
        {beliefs.length === 0 && (
          <p className="type-small text-ink-3">
            No beliefs yet. Two or three real positions are worth more than ten hedged ones.
          </p>
        )}

        {beliefs.map((belief) => (
          <ListRow key={belief.id} onRemove={() => onChange(beliefs.filter((b) => b.id !== belief.id))}>
            <textarea
              value={belief.statement}
              onChange={(e) => update(belief.id, { statement: e.target.value })}
              rows={2}
              placeholder="Good UX is usually more valuable than adding another ten features."
              className="type-body w-full rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink placeholder:text-ink-3"
            />
            <div className="mt-2 flex flex-wrap items-center gap-4">
              {/*
                Strength is a mono label in --ink-3, not a coloured chip.
                A belief is not an epistemic state, so it does not get to use
                the epistemic palette.
              */}
              <div className="flex items-center gap-2">
                <MicroLabel>strength</MicroLabel>
                <RadioRow<BeliefStrength>
                  name="Strength"
                  value={belief.strength}
                  onChange={(strength) => update(belief.id, { strength })}
                  options={[
                    { value: "mild", label: "Mild" },
                    { value: "moderate", label: "Moderate" },
                    { value: "strong", label: "Strong" },
                  ]}
                />
              </div>

              <label className="flex items-center gap-2">
                <MicroLabel>pillar</MicroLabel>
                <select
                  value={belief.pillarId ?? ""}
                  onChange={(e) => update(belief.id, { pillarId: e.target.value || null })}
                  className="type-small rounded-control border border-rule-strong bg-surface px-2 py-1 text-ink"
                >
                  <option value="">General</option>
                  {pillars.map((pillar) => (
                    <option key={pillar.id} value={pillar.id}>
                      {pillar.name || "Unnamed pillar"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2">
                <MicroLabel>active</MicroLabel>
                <input
                  type="checkbox"
                  checked={belief.enabled}
                  aria-label="Belief active"
                  onChange={(e) => update(belief.id, { enabled: e.target.checked })}
                  className="accent-ink size-4"
                />
              </label>
            </div>
          </ListRow>
        ))}
      </Card>
    </Section>
  );
}

/* -------------------------------------------------------------- boundaries -- */

interface BoundaryProps {
  boundaries: import("@/domain/persona/schema").Boundary[];
  onChange: (boundaries: import("@/domain/persona/schema").Boundary[]) => void;
}

export function BoundariesSection({ boundaries, onChange }: BoundaryProps) {
  const stock = boundaries.filter((b) => b.kind !== "custom");
  const custom = boundaries.filter((b) => b.kind === "custom");

  function update(id: string, changes: Partial<(typeof boundaries)[number]>) {
    onChange(boundaries.map((b) => (b.id === id ? { ...b, ...changes } : b)));
  }

  return (
    <Section
      id="boundaries"
      title="Boundaries"
      intro="Hard blocks. A boundary is checked against a topic before anything is written, not after - so a blocked subject never reaches the writer."
      action={
        <Button
          onClick={() => onChange([...boundaries, { id: newId(), kind: "custom", value: "", enabled: true }])}
        >
          Add boundary
        </Button>
      }
    >
      <Card padding="24">
        {stock.map((boundary) => (
          <Toggle
            key={boundary.id}
            label={boundary.value}
            checked={boundary.enabled}
            onChange={(enabled) => update(boundary.id, { enabled })}
          />
        ))}

        {custom.length > 0 && (
          <div className="mt-4 border-t border-rule pt-4">
            <MicroLabel strong className="mb-2 block">
              your own
            </MicroLabel>
            {custom.map((boundary) => (
              <ListRow key={boundary.id} onRemove={() => onChange(boundaries.filter((b) => b.id !== boundary.id))}>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={boundary.enabled}
                    aria-label={`Enable ${boundary.value || "boundary"}`}
                    onChange={(e) => update(boundary.id, { enabled: e.target.checked })}
                    className="accent-ink size-4 shrink-0"
                  />
                  <input
                    value={boundary.value}
                    onChange={(e) => update(boundary.id, { value: e.target.value })}
                    placeholder="Something this writer never touches"
                    className="type-body w-full rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink placeholder:text-ink-3"
                  />
                </div>
              </ListRow>
            ))}
          </div>
        )}
      </Card>
    </Section>
  );
}
