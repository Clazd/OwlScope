"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Field, TextInput, Toggle } from "@/components/common/Field";
import { MicroLabel } from "@/components/common/MicroLabel";
import { ScoreBar } from "@/components/common/ScoreBar";
import { StageSpinner } from "@/components/common/StageSpinner";
import { useToast } from "@/components/common/Toast";
import { cn } from "@/lib/format/cn";
import { newId } from "@/lib/ids";
import type { Deviation } from "@/domain/persona/fingerprint";
import type { Belief, Persona, PersonaSnapshot, Pillar, Sample } from "@/domain/persona/schema";
import { normaliseWeights, redistributeWeights, setPillarEnabled } from "@/domain/persona/weights";

/**
 * Onboarding: one question per screen, eleven steps, five to eight minutes.
 *
 * It never asks for an X account - there is no X integration in this product.
 * Partial state is saved at every step, so closing the tab loses nothing, and
 * it can be re-run later without wiping what already exists.
 */

interface Props {
  initial: PersonaSnapshot;
  /** True when there is already a persona, so the copy says "re-run". */
  rerun: boolean;
}

const STEPS = [
  "start",
  "name",
  "language",
  "subjects",
  "pillars",
  "audience",
  "voice",
  "boundaries",
  "beliefs",
  "avoid",
  "preview",
  "done",
] as const;
type Step = (typeof STEPS)[number];

export function Onboarding({ initial, rerun }: Props) {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<Step>(rerun ? "name" : "start");
  const [draft, setDraft] = useState<PersonaSnapshot>(initial);
  const [subjects, setSubjects] = useState("");
  const [saving, setSaving] = useState(false);

  const index = STEPS.indexOf(step);
  const progress = index / (STEPS.length - 1);

  const patchPersona = useCallback((changes: Partial<Persona>) => {
    setDraft((current) => ({ ...current, persona: { ...current.persona, ...changes } }));
  }, []);

  /**
   * Saves the partial persona so the wizard is resumable. Fire-and-forget: a
   * failed autosave must not block the user from continuing to the next
   * question, and the final step saves everything again anyway.
   */
  const persist = useCallback(async (snapshot: PersonaSnapshot, reason: string) => {
    try {
      await fetch("/api/persona", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshot, changeReason: reason }),
      });
    } catch {
      /* resumability is a convenience, not a guarantee the user must wait on */
    }
  }, []);

  function goto(next: Step) {
    setStep(next);
    void persist(draft, `Onboarding: ${next}`);
  }

  function advance() {
    const next = STEPS[Math.min(STEPS.length - 1, index + 1)];
    if (next) goto(next);
  }

  function back() {
    const previous = STEPS[Math.max(0, index - 1)];
    if (previous) setStep(previous);
  }

  async function loadDemo() {
    setSaving(true);
    try {
      const response = await fetch("/api/persona/demo", { method: "POST" });
      if (!response.ok) {
        toast.show("The demo persona could not be loaded.", "failure");
        return;
      }
      toast.show("Loaded the Nova demo persona.");
      router.push("/brain");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setSaving(true);
    const snapshot: PersonaSnapshot = {
      ...draft,
      persona: {
        ...draft.persona,
        onboardingComplete: true,
        pillars: normaliseWeights(draft.persona.pillars),
      },
    };
    try {
      const response = await fetch("/api/persona", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshot, changeReason: rerun ? "Re-ran onboarding" : "Completed onboarding" }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.show(body.error ?? "The persona could not be saved.", "failure");
        return;
      }
      toast.show(`Saved version ${body.version}.`);
      router.push("/today");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-6 py-6">
      {/* Progress is a thin ink rule. No percentage, no step counter shouting. */}
      <div className="reading-column mb-8">
        <div className="h-px w-full bg-rule">
          <div
            className="h-px bg-ink transition-[width] duration-(--dur-panel) ease-(--ease)"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between">
          <MicroLabel>
            step {index + 1} of {STEPS.length}
          </MicroLabel>
          {step !== "start" && step !== "done" && (
            <button type="button" onClick={back} className="type-micro text-ink-3 hover:text-ink">
              Back
            </button>
          )}
        </div>
      </div>

      <div className="reading-column">
        {step === "start" && (
          <StepShell
            question="Let's define who is writing."
            help="Eleven questions, one per screen, about five minutes. Nothing here asks for an account on any platform - this app never posts for you."
          >
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => router.push("/brain#inbox")}>
                Paste ChatGPT profile instead
              </Button>
              <Button variant="primary" onClick={advance}>
                Answer manually
              </Button>
              <Button onClick={loadDemo} disabled={saving}>
                Load the Nova demo persona
              </Button>
            </div>
            <p className="type-small mt-3 text-ink-3">
              The demo is a complete worked example with twenty writing samples. Load it to see the product
              working, then edit or delete it.
            </p>
          </StepShell>
        )}

        {step === "name" && (
          <StepShell question="What is this writer called?" onNext={advance} nextDisabled={!draft.persona.name.trim()}>
            <TextInput
              autoFocus
              value={draft.persona.name}
              onChange={(e) => patchPersona({ name: e.target.value })}
              placeholder="Nova"
            />
            <Field label="One-line description" hint="Optional. What this writer is about.">
              <TextInput
                value={draft.persona.description}
                onChange={(e) => patchPersona({ description: e.target.value })}
                placeholder="Writes about AI, software and the odd corners of both."
              />
            </Field>
          </StepShell>
        )}

        {step === "language" && (
          <StepShell question="What language does it write in?" onNext={advance}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primary">
                <TextInput
                  mono
                  value={draft.persona.primaryLanguage}
                  onChange={(e) => patchPersona({ primaryLanguage: e.target.value })}
                  placeholder="en"
                />
              </Field>
              <Field label="Secondary" hint="Optional.">
                <TextInput
                  mono
                  value={draft.persona.secondaryLanguage ?? ""}
                  onChange={(e) => patchPersona({ secondaryLanguage: e.target.value || null })}
                  placeholder="-"
                />
              </Field>
            </div>
          </StepShell>
        )}

        {step === "subjects" && (
          <StepShell
            question="What does it talk about?"
            help="Write it however you think about it. The next screen turns this into pillars you can weight."
            onNext={advance}
          >
            <textarea
              autoFocus
              value={subjects}
              onChange={(e) => setSubjects(e.target.value)}
              rows={4}
              placeholder="AI tooling, programming craft, odd software experiments, product decisions"
              className="type-body w-full rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink placeholder:text-ink-3"
            />
            <Field label="Identity statement" hint="First person. The sentence the writer reasons from.">
              <textarea
                value={draft.persona.identityStatement}
                onChange={(e) => patchPersona({ identityStatement: e.target.value })}
                rows={3}
                placeholder="I am someone deeply interested in…"
                className="type-body w-full rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink placeholder:text-ink-3"
              />
            </Field>
          </StepShell>
        )}

        {step === "pillars" && (
          <PillarStep
            pillars={draft.persona.pillars}
            suggestions={suggestPillars(subjects)}
            onChange={(pillars) => patchPersona({ pillars })}
            onNext={advance}
          />
        )}

        {step === "audience" && (
          <StepShell question="Who is it writing for?" onNext={advance}>
            <TextInput
              autoFocus
              value={draft.persona.audience}
              onChange={(e) => patchPersona({ audience: e.target.value })}
              placeholder="Engineers and product people who build things."
            />
          </StepShell>
        )}

        {step === "voice" && (
          <VoiceStep
            samples={draft.samples}
            onChange={(samples) => setDraft((current) => ({ ...current, samples }))}
            onNext={advance}
          />
        )}

        {step === "boundaries" && (
          <StepShell question="Anything it should never touch?" onNext={advance}>
            {draft.persona.boundaries
              .filter((b) => b.kind !== "custom")
              .map((boundary) => (
                <Toggle
                  key={boundary.id}
                  label={boundary.value}
                  checked={boundary.enabled}
                  onChange={(enabled) =>
                    patchPersona({
                      boundaries: draft.persona.boundaries.map((b) =>
                        b.id === boundary.id ? { ...b, enabled } : b,
                      ),
                    })
                  }
                />
              ))}
            <p className="type-small mt-3 text-ink-3">
              A boundary is checked before anything is written, so a blocked subject never reaches the writer.
            </p>
          </StepShell>
        )}

        {step === "beliefs" && (
          <BeliefStep
            beliefs={draft.persona.beliefs}
            onChange={(beliefs) => patchPersona({ beliefs })}
            onNext={advance}
          />
        )}

        {step === "avoid" && (
          <StepShell
            question="Anything it should never sound like?"
            help="These become voice rules. There are already seven seeded ones you can edit later in Brain."
            onNext={advance}
          >
            <textarea
              autoFocus
              rows={4}
              placeholder={"One per line.\nNo hype vocabulary.\nNever open with a rhetorical question."}
              onChange={(e) => {
                const seeded = draft.persona.voiceRules.filter((r) => !r.id.startsWith("onboarding-"));
                const added = e.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((rule, i) => ({
                    id: `onboarding-${i}`,
                    rule,
                    ruleType: "never" as const,
                    enabled: true,
                  }));
                patchPersona({ voiceRules: [...seeded, ...added] });
              }}
              className="type-body w-full rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink placeholder:text-ink-3"
            />
          </StepShell>
        )}

        {step === "preview" && <PreviewStep draft={draft} onNext={advance} />}

        {step === "done" && (
          <StepShell
            question={`${draft.persona.name || "Your writer"} is ready.`}
            help="Everything here is editable in Brain, and every save from now on creates a version you can restore."
          >
            <Button variant="primary" onClick={finish} disabled={saving}>
              {saving ? "Saving" : "Save and go to Today"}
            </Button>
          </StepShell>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ parts -- */

function StepShell({
  question,
  help,
  children,
  onNext,
  nextDisabled,
}: {
  question: string;
  help?: string;
  children: React.ReactNode;
  onNext?: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <div>
      <h1 className="type-display text-ink">{question}</h1>
      {help && <p className="type-body mt-2 text-ink-2">{help}</p>}
      <div className="mt-6 space-y-4">{children}</div>
      {onNext && (
        <div className="mt-6">
          <Button variant="primary" onClick={onNext} disabled={nextDisabled}>
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}

/** Turns the free-text answer from the previous step into pillar suggestions. */
function suggestPillars(subjects: string): string[] {
  return subjects
    .split(/[,\n;]|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
    .slice(0, 8);
}

function PillarStep({
  pillars,
  suggestions,
  onChange,
  onNext,
}: {
  pillars: Pillar[];
  suggestions: string[];
  onChange: (pillars: Pillar[]) => void;
  onNext: () => void;
}) {
  const unused = useMemo(
    () => suggestions.filter((s) => !pillars.some((p) => p.name.toLowerCase() === s.toLowerCase())),
    [suggestions, pillars],
  );

  function add(name: string) {
    const pillar: Pillar = {
      id: newId(),
      name,
      description: "",
      weight: 0,
      enabled: true,
      freshnessPreference: "balanced",
      subtopics: [],
    };
    onChange(setPillarEnabled([...pillars, pillar], pillar.id, true));
  }

  return (
    <StepShell
      question="What are its pillars?"
      help="Weights are soft pressure on what gets looked at, not a quota. If the best idea today sits in a 10% pillar, that idea still wins."
      onNext={onNext}
      nextDisabled={pillars.length === 0}
    >
      {unused.length > 0 && (
        <div>
          <MicroLabel strong className="mb-2 block">
            from what you wrote
          </MicroLabel>
          <div className="flex flex-wrap gap-2">
            {unused.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => add(suggestion)}
                className="type-small rounded-pill border border-rule-strong px-3 py-1 text-ink-2 hover:bg-surface-sunken hover:text-ink"
              >
                + {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      <Card>
        {pillars.length === 0 && <p className="type-small text-ink-3">No pillars yet.</p>}
        {pillars.map((pillar) => (
          <div key={pillar.id} className="border-t border-rule py-3 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-3">
              <TextInput
                value={pillar.name}
                onChange={(e) =>
                  onChange(pillars.map((p) => (p.id === pillar.id ? { ...p, name: e.target.value } : p)))
                }
                placeholder="Pillar name"
                className="grow"
              />
              <span data-mono className="type-data w-12 shrink-0 text-right text-ink-2">
                {pillar.weight}%
              </span>
              <button
                type="button"
                onClick={() => onChange(normaliseWeights(pillars.filter((p) => p.id !== pillar.id)))}
                className="type-micro shrink-0 text-ink-3 hover:text-unsupported"
              >
                Remove
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={pillar.weight}
              aria-label={`${pillar.name || "Pillar"} weight`}
              onChange={(e) => onChange(redistributeWeights(pillars, pillar.id, Number(e.target.value)))}
              className="accent-ink mt-2 w-full"
            />
          </div>
        ))}
        <Button className="mt-3" onClick={() => add("")}>
          Add a pillar
        </Button>
      </Card>
    </StepShell>
  );
}

function VoiceStep({
  samples,
  onChange,
  onNext,
}: {
  samples: Sample[];
  onChange: (samples: Sample[]) => void;
  onNext: () => void;
}) {
  const [bulk, setBulk] = useState("");
  const [mode, setMode] = useState<Sample["mode"]>("mine");

  function add() {
    const texts = bulk
      .split(/\n\s*\n/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (texts.length === 0) return;
    onChange([
      ...samples,
      ...texts.map<Sample>((text) => ({ id: newId(), text, mode, createdAt: new Date().toISOString() })),
    ]);
    setBulk("");
  }

  return (
    <StepShell
      question="Paste some posts you have written."
      help="This is the step that matters. Sliders alone produce beige output; fifteen to forty real posts give the writer a rhythm to match."
      onNext={onNext}
    >
      <div className="flex flex-wrap items-center gap-3">
        <MicroLabel strong>these are</MicroLabel>
        <div className="inline-flex rounded-control border border-rule-strong p-1">
          {(["mine", "admired"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                "type-small rounded-control px-3 py-1",
                mode === value ? "bg-ink text-bg" : "text-ink-2 hover:text-ink",
              )}
            >
              {value === "mine" ? "Mine" : "Admired"}
            </button>
          ))}
        </div>
      </div>
      <p className="type-small text-ink-3">
        Admired posts are somebody else&apos;s. They shape cadence and structure only, never opinions.
      </p>

      <textarea
        autoFocus
        value={bulk}
        onChange={(e) => setBulk(e.target.value)}
        rows={10}
        placeholder={"Paste posts here.\n\nSeparate each one with a blank line."}
        className="type-body w-full rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink placeholder:text-ink-3"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={add}>Add posts</Button>
        <MicroLabel>
          {samples.filter((s) => s.mode === "mine").length} yours ·{" "}
          {samples.filter((s) => s.mode === "admired").length} admired
        </MicroLabel>
      </div>

      <p className="type-small text-ink-3">
        You can skip this and tune with sliders instead, but the fingerprint is the difference between
        &ldquo;sounds like an AI&rdquo; and &ldquo;sounds like you&rdquo;. You can always add posts later in Brain.
      </p>
    </StepShell>
  );
}

function BeliefStep({
  beliefs,
  onChange,
  onNext,
}: {
  beliefs: Belief[];
  onChange: (beliefs: Belief[]) => void;
  onNext: () => void;
}) {
  return (
    <StepShell
      question="What does it actually think?"
      help="Two to five real positions. The writer may argue from these and may never invent a new one."
      onNext={onNext}
    >
      <Card>
        {beliefs.map((belief) => (
          <div key={belief.id} className="flex items-start gap-3 border-t border-rule py-3 first:border-t-0 first:pt-0">
            <TextInput
              value={belief.statement}
              onChange={(e) =>
                onChange(beliefs.map((b) => (b.id === belief.id ? { ...b, statement: e.target.value } : b)))
              }
              placeholder="Good UX is usually more valuable than adding another ten features."
              className="grow"
            />
            <button
              type="button"
              onClick={() => onChange(beliefs.filter((b) => b.id !== belief.id))}
              className="type-micro shrink-0 py-2 text-ink-3 hover:text-unsupported"
            >
              Remove
            </button>
          </div>
        ))}
        <Button
          className="mt-3"
          onClick={() =>
            onChange([
              ...beliefs,
              { id: newId(), statement: "", strength: "moderate", pillarId: null, enabled: true },
            ])
          }
        >
          Add a belief
        </Button>
      </Card>
    </StepShell>
  );
}

function PreviewStep({ draft, onNext }: { draft: PersonaSnapshot; onNext: () => void }) {
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [samples, setSamples] = useState<Array<{ text: string; score: number; deviations: Deviation[] }> | null>(
    null,
  );

  async function preview() {
    setRunning(true);
    try {
      const topic = draft.persona.pillars.find((p) => p.enabled)?.name || "something you noticed this week";
      const response = await fetch("/api/test-voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          persona: draft.persona,
          fingerprint: draft.fingerprint,
          idempotencyKey: `onboarding-preview-${Date.now()}`,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.show(body.error ?? "The preview failed.", "failure");
        return;
      }
      setSamples(body.samples);
    } finally {
      setRunning(false);
    }
  }

  return (
    <StepShell
      question="Here is how it sounds."
      help="A live sample from what you have entered. If it is wrong, go back - or fix it in Brain, which is where you will do most of the tuning."
      onNext={onNext}
    >
      <Button variant="primary" onClick={preview} disabled={running}>
        {running ? "Writing" : samples ? "Try again" : "Generate a preview"}
      </Button>

      {running && <StageSpinner stage="Writing in your voice" />}

      {samples?.map((sample, i) => (
        <Card key={i}>
          <p className="type-manuscript text-ink">{sample.text}</p>
          <ScoreBar value={sample.score / 100} label="voice match" className="mt-3" />
          {sample.deviations.map((deviation, j) => (
            <p key={j} className="type-small mt-1 text-ink-2">
              {deviation.message}
            </p>
          ))}
        </Card>
      ))}
    </StepShell>
  );
}
