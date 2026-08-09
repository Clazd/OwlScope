"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/common/Button";
import { Card, CardSection } from "@/components/common/Card";
import { Field, TextInput, Toggle } from "@/components/common/Field";
import { MicroLabel } from "@/components/common/MicroLabel";
import { SliderRow } from "@/components/common/SliderRow";
import { StageSpinner } from "@/components/common/StageSpinner";
import { useToast } from "@/components/common/Toast";
import { cn } from "@/lib/format/cn";
import { newId } from "@/lib/ids";
import {
  SLIDER_DIMENSIONS,
  SWITCH_KEYS,
  type Fingerprint,
  type Persona,
  type Sample,
} from "@/domain/persona/schema";
import { sentenceHistogram, statisticsFromSamples } from "@/domain/persona/statistics";
import { SentenceHistogram } from "./SentenceHistogram";
import { ListRow, Section } from "./section-chrome";

interface Props {
  fingerprint: Fingerprint | null;
  samples: Sample[];
  persona: Persona;
  onFingerprintChange: (fingerprint: Fingerprint | null) => void;
  onSamplesChange: (samples: Sample[]) => void;
  onPersonaChange: (changes: Partial<Persona>) => void;
}

export function FingerprintSection({
  fingerprint,
  samples,
  persona,
  onFingerprintChange,
  onSamplesChange,
  onPersonaChange,
}: Props) {
  const toast = useToast();
  const [analysing, setAnalysing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState("");
  const [bulkMode, setBulkMode] = useState<Sample["mode"]>("mine");

  const mine = samples.filter((s) => s.mode === "mine");
  const admired = samples.filter((s) => s.mode === "admired");
  const stats = useMemo(() => statisticsFromSamples(samples), [samples]);
  const bins = useMemo(
    () => sentenceHistogram((stats.basis === "admired" ? admired : mine).map((s) => s.text)),
    [stats.basis, mine, admired],
  );

  async function analyse(overwriteUserEdits = false) {
    setAnalysing(true);
    try {
      const response = await fetch("/api/persona/fingerprint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          samples,
          idempotencyKey: `fingerprint-${Date.now()}`,
          overwriteUserEdits,
        }),
      });
      const body = await response.json();

      if (response.status === 409 && body.needsConfirmation) {
        // Never silently overwrite a hand-edited fingerprint.
        if (window.confirm(`${body.error}\n\nReplace your edits?`)) await analyse(true);
        return;
      }
      if (!response.ok) {
        toast.show(body.error ?? "The analysis failed.", "failure");
        return;
      }
      onFingerprintChange(body.fingerprint);
      toast.show(
        `Fingerprint derived from ${body.fingerprint.derivedFromCount} posts.${body.sandbox ? " Sandbox." : ""}`,
      );
    } catch (err) {
      toast.show(`The analysis failed: ${(err as Error).message}`, "failure");
    } finally {
      setAnalysing(false);
    }
  }

  function addBulk() {
    // Blank lines separate posts, which is how people paste them.
    const texts = bulk
      .split(/\n\s*\n/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (texts.length === 0) return;
    onSamplesChange([
      ...samples,
      ...texts.map<Sample>((text) => ({
        id: newId(),
        text,
        mode: bulkMode,
        createdAt: new Date().toISOString(),
      })),
    ]);
    setBulk("");
    setAdding(false);
    toast.show(`Added ${texts.length} sample${texts.length === 1 ? "" : "s"}.`);
  }

  function editField(changes: Partial<Fingerprint>) {
    if (!fingerprint) return;
    // Any touch marks it hand-edited, which is what makes re-analysis ask first.
    onFingerprintChange({ ...fingerprint, ...changes, editedByUser: true });
  }

  return (
    <Section
      id="fingerprint"
      title="Voice fingerprint"
      intro={
        fingerprint
          ? `Learned from ${fingerprint.derivedFromCount} posts you pasted in.${fingerprint.editedByUser ? " Hand-corrected by you." : ""}`
          : "Sliders alone produce beige output. Paste 15 to 40 real posts and the fingerprint learns the rhythm sliders cannot express."
      }
      action={
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "Add posts"}</Button>
          <Button variant="primary" onClick={() => analyse()} disabled={analysing || samples.length === 0}>
            {analysing ? "Analysing" : fingerprint ? "Re-analyse" : "Analyse"}
          </Button>
        </div>
      }
    >
      <Card padding="24">
        <CardSection label="samples">
          <p data-mono className="type-data text-ink-2">
            {mine.length} yours · {admired.length} admired
          </p>
          <p className="type-small mt-1 text-ink-3">
            Admired posts are somebody else&apos;s writing. They shape cadence and structure only, and are never
            used as a source of opinions or claims.
          </p>

          {adding && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <MicroLabel strong>these are</MicroLabel>
                <div className="inline-flex rounded-control border border-rule-strong p-1">
                  {(["mine", "admired"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setBulkMode(mode)}
                      className={cn(
                        "type-small rounded-control px-3 py-1",
                        bulkMode === mode ? "bg-ink text-bg" : "text-ink-2 hover:text-ink",
                      )}
                    >
                      {mode === "mine" ? "Mine" : "Admired"}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                rows={8}
                placeholder={"Paste posts here.\n\nSeparate each one with a blank line."}
                className="type-body w-full rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink placeholder:text-ink-3"
              />
              <Button variant="primary" onClick={addBulk}>
                Add posts
              </Button>
            </div>
          )}

          {samples.length > 0 && (
            <details className="mt-3">
              <summary className="type-small cursor-pointer text-ink-2 hover:text-ink">
                Show the {samples.length} samples
              </summary>
              <div className="mt-2">
                {samples.map((sample) => (
                  <ListRow key={sample.id} onRemove={() => onSamplesChange(samples.filter((s) => s.id !== sample.id))}>
                    <MicroLabel>{sample.mode}</MicroLabel>
                    <p className="type-small mt-1 text-ink-2">{sample.text}</p>
                  </ListRow>
                ))}
              </div>
            </details>
          )}
        </CardSection>

        {analysing && (
          <CardSection className="mt-4">
            <StageSpinner stage="Reading your samples" />
          </CardSection>
        )}

        {!fingerprint && samples.length > 0 && !analysing && (
          <CardSection className="mt-4">
            <p className="type-small text-ink-2">
              {samples.length} sample{samples.length === 1 ? "" : "s"} ready. The lengths and punctuation habits
              below are already measured; analysing adds the qualitative read.
            </p>
            <Measurements stats={stats} bins={bins} className="mt-3" />
          </CardSection>
        )}

        {fingerprint && (
          <>
            <CardSection label="measured from your posts" className="mt-4">
              <Measurements
                stats={{
                  sentenceLength: fingerprint.sentenceLength,
                  postLength: fingerprint.postLength,
                  punctuation: fingerprint.punctuation,
                  emojiUse: fingerprint.emojiUse,
                  hashtagUse: fingerprint.hashtagUse,
                }}
                bins={bins}
              />
            </CardSection>

            <CardSection label="read from your posts" className="mt-4">
              <Rows
                rows={[
                  ["openings you use", fingerprint.openingPatterns.join(" · ")],
                  ["openings to avoid", fingerprint.avoidedOpenings.join(" · ")],
                  ["capitalisation", fingerprint.capitalisation],
                  ["words you use", fingerprint.vocabulary.preferred.join(" · ")],
                  ["words you never use", fingerprint.vocabulary.absent.join(" · ")],
                  ["structural habits", fingerprint.structuralHabits.join(" · ")],
                ]}
              />
              <Button className="mt-3" onClick={() => setEditing((v) => !v)}>
                {editing ? "Done editing" : "Edit fingerprint"}
              </Button>
            </CardSection>

            {editing && (
              <CardSection label="edit" className="mt-4">
                <p className="type-small mb-3 text-ink-3">
                  Every field is yours to correct. Once you edit one, re-analysing asks before replacing your
                  changes.
                </p>
                <ListField
                  label="Openings you use"
                  value={fingerprint.openingPatterns}
                  onChange={(openingPatterns) => editField({ openingPatterns })}
                />
                <ListField
                  label="Openings to avoid"
                  hint="Literal phrases. The critic checks a draft's first words against these."
                  value={fingerprint.avoidedOpenings}
                  onChange={(avoidedOpenings) => editField({ avoidedOpenings })}
                />
                <Field label="Capitalisation">
                  <TextInput
                    value={fingerprint.capitalisation}
                    onChange={(e) => editField({ capitalisation: e.target.value })}
                  />
                </Field>
                <ListField
                  label="Words you use"
                  value={fingerprint.vocabulary.preferred}
                  onChange={(preferred) =>
                    editField({ vocabulary: { ...fingerprint.vocabulary, preferred } })
                  }
                />
                <ListField
                  label="Words you never use"
                  value={fingerprint.vocabulary.absent}
                  onChange={(absent) => editField({ vocabulary: { ...fingerprint.vocabulary, absent } })}
                />
                <ListField
                  label="Structural habits"
                  value={fingerprint.structuralHabits}
                  onChange={(structuralHabits) => editField({ structuralHabits })}
                />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Sentence median">
                    <TextInput
                      mono
                      type="number"
                      value={fingerprint.sentenceLength.median}
                      onChange={(e) =>
                        editField({
                          sentenceLength: { ...fingerprint.sentenceLength, median: Number(e.target.value) || 0 },
                        })
                      }
                    />
                  </Field>
                  <Field label="Sentence p90">
                    <TextInput
                      mono
                      type="number"
                      value={fingerprint.sentenceLength.p90}
                      onChange={(e) =>
                        editField({
                          sentenceLength: { ...fingerprint.sentenceLength, p90: Number(e.target.value) || 0 },
                        })
                      }
                    />
                  </Field>
                  <Field label="Post p90">
                    <TextInput
                      mono
                      type="number"
                      value={fingerprint.postLength.p90}
                      onChange={(e) =>
                        editField({ postLength: { ...fingerprint.postLength, p90: Number(e.target.value) || 0 } })
                      }
                    />
                  </Field>
                </div>
              </CardSection>
            )}
          </>
        )}

        <CardSection label="adjustments beyond your samples" className="mt-4">
          <p className="type-small mb-2 text-ink-3">
            For what samples cannot express — &ldquo;be more opinionated than my old posts were.&rdquo;
          </p>
          {SLIDER_DIMENSIONS.map((dimension) => (
            <SliderRow
              key={dimension.key}
              name={`${dimension.low} to ${dimension.high}`}
              lowLabel={dimension.low}
              highLabel={dimension.high}
              value={persona.sliders[dimension.key]}
              onChange={(value) =>
                onPersonaChange({ sliders: { ...persona.sliders, [dimension.key]: value } })
              }
            />
          ))}
          <div className="mt-2 border-t border-rule pt-2">
            {SWITCH_KEYS.map((item) => (
              <Toggle
                key={item.key}
                label={item.label}
                checked={persona.switches[item.key]}
                onChange={(value) => onPersonaChange({ switches: { ...persona.switches, [item.key]: value } })}
              />
            ))}
          </div>
        </CardSection>
      </Card>
    </Section>
  );
}

/* ------------------------------------------------------------------ parts -- */

interface MeasurementProps {
  stats: {
    sentenceLength: { median: number; p10: number; p90: number };
    postLength: { median: number; p90: number };
    punctuation: { emDash: string; semicolon: string; ellipsis: string; listMarkers: string };
    emojiUse: string;
    hashtagUse: string;
  };
  bins: number[];
  className?: string;
}

function Measurements({ stats, bins, className }: MeasurementProps) {
  return (
    <div className={className}>
      {/* items-start, so the two labels line up with each other rather than the
          taller histogram pushing "post length" to the bottom of the row. */}
      <div className="flex flex-wrap items-start gap-8">
        <div>
          <MicroLabel strong className="mb-1 block">
            sentence length
          </MicroLabel>
          <p data-mono className="type-data text-ink-2">
            median {stats.sentenceLength.median} · p10 {stats.sentenceLength.p10} · p90 {stats.sentenceLength.p90}
          </p>
          <SentenceHistogram bins={bins} className="mt-2" />
        </div>
        <div>
          <MicroLabel strong className="mb-1 block">
            post length
          </MicroLabel>
          <p data-mono className="type-data text-ink-2">
            median {stats.postLength.median} · p90 {stats.postLength.p90}
          </p>
        </div>
      </div>

      <Rows
        className="mt-3"
        rows={[
          [
            "punctuation",
            `em dash ${stats.punctuation.emDash} · semicolon ${stats.punctuation.semicolon} · ellipsis ${stats.punctuation.ellipsis} · lists ${stats.punctuation.listMarkers}`,
          ],
          ["emoji", stats.emojiUse],
          ["hashtags", stats.hashtagUse],
        ]}
      />
      <p className="type-small mt-2 text-ink-3">
        These are counted in code, never by the model.
      </p>
    </div>
  );
}

/** Mono label on the left, sans value on the right. The Brain layout idiom. */
function Rows({ rows, className }: { rows: Array<[string, string]>; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-2 sm:grid-cols-[180px_1fr]", className)}>
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt>
            <MicroLabel strong>{label}</MicroLabel>
          </dt>
          <dd className="type-body text-ink-2">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function ListField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <TextInput
        value={value.join(" · ")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split("·")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        placeholder="separate with ·"
      />
    </Field>
  );
}
