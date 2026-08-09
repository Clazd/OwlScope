"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Card, CardSection } from "@/components/common/Card";
import { useCommands } from "@/components/common/command-registry";
import { DiffList } from "@/components/common/DiffList";
import { EmptyState } from "@/components/common/EmptyState";
import { EPISTEMIC_STATES, EpistemicChip } from "@/components/common/EpistemicChip";
import { Field, RadioRow, TextInput, Toggle } from "@/components/common/Field";
import { MicroLabel } from "@/components/common/MicroLabel";
import { NAV_ITEMS, NavRail } from "@/components/common/NavRail";
import { PipelineRail } from "@/components/common/PipelineRail";
import { ReasonChips } from "@/components/common/ReasonChips";
import { ScoreBar } from "@/components/common/ScoreBar";
import { SentenceManuscript } from "@/components/common/SentenceManuscript";
import { SliderRow } from "@/components/common/SliderRow";
import { SourceDrawer } from "@/components/common/SourceDrawer";
import { StageSpinner } from "@/components/common/StageSpinner";
import { Toast, useToast } from "@/components/common/Toast";
import { TokenMeter } from "@/components/common/TokenMeter";
import { XPreviewCard } from "@/components/common/XPreviewCard";

/**
 * Every component in the slice 1 inventory, in every state it has.
 *
 * This page is the contract: later slices import from components/common and
 * build nothing, so if a state is not visible here it does not exist.
 */
export function Gallery() {
  return (
    <div className="space-y-8">
      <Section name="MicroLabel">
        <div className="flex flex-wrap items-center gap-6">
          <MicroLabel>default</MicroLabel>
          <MicroLabel strong>strong</MicroLabel>
          <MicroLabel>2026-08-09 14:32</MicroLabel>
        </div>
      </Section>

      <Section name="EpistemicChip" note="The only coloured chip in the product. Four states, one meaning each.">
        <div className="flex flex-wrap gap-2">
          {EPISTEMIC_STATES.map((state) => (
            <EpistemicChip key={state} state={state} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {EPISTEMIC_STATES.map((state) => (
            <EpistemicChip key={state} state={state} compact />
          ))}
        </div>
      </Section>

      <Section name="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Generate post</Button>
          <Button variant="secondary">Copy post</Button>
          <Button variant="quiet">Skip</Button>
          <Button variant="destructive">Delete draft</Button>
          <Button variant="primary" disabled>
            Over budget
          </Button>
        </div>
      </Section>

      <Section name="Card">
        <Card label="With a label" action={<MicroLabel>action slot</MicroLabel>}>
          <p className="type-body text-ink-2">16px padding, the default.</p>
        </Card>
        <Card padding="24" className="mt-3">
          <CardSection label="First section">
            <p className="type-body text-ink-2">Divisions inside a card are a rule and a mono label.</p>
          </CardSection>
          <CardSection label="Second section" className="mt-3">
            <p className="type-body text-ink-2">Never a bordered card inside a bordered card.</p>
          </CardSection>
        </Card>
      </Section>

      <Section name="ScoreBar" note="Ten segments, filled in ink. Never coloured - a score is not a claim about truth.">
        {[0, 0.3, 0.62, 1].map((value) => (
          <ScoreBar key={value} value={value} label="fit" className="mb-2" />
        ))}
      </Section>

      <Section name="TokenMeter" note="Ink until 80%, then amber.">
        <div className="max-w-[240px] space-y-4">
          <TokenMeter used={0} budget={200_000} />
          <TokenMeter used={62_000} budget={200_000} />
          <TokenMeter used={168_000} budget={200_000} />
          <TokenMeter used={200_000} budget={200_000} />
          <TokenMeter used={62_000} budget={200_000} compact />
        </div>
      </Section>

      <Section name="PipelineRail" note="The active stage carries the only ambient animation in the product.">
        <PipelineRail
          stages={[
            { name: "Research", state: "done", latencyMs: 2140 },
            { name: "Validate claims", state: "done", latencyMs: 890 },
            { name: "Check memory", state: "active" },
            { name: "Write", state: "pending" },
            { name: "Critique", state: "pending" },
            { name: "Fact-check quotes", state: "skipped", detail: "no quotes" },
            { name: "Score", state: "failed", detail: "timeout" },
          ]}
        />
      </Section>

      <Section name="StageSpinner" note="Named stage plus pulse. Never a percentage.">
        <StageSpinner stage="Checking what you have already said" />
      </Section>

      <Section name="EmptyState">
        <EmptyState action={<Button>Run a scan</Button>}>
          No topics yet. Run a scan, or type an idea you have been sitting on.
        </EmptyState>
      </Section>

      <Section
        name="SentenceManuscript"
        note="The Evidence Margin. Hover or focus a sentence; arrow keys move between them. The unsupported sentence is the only underlined text in the product."
      >
        <SentenceManuscript
          sentences={[
            {
              id: "s1",
              text: "Regulators published the consultation on Tuesday.",
              state: "supported",
              sources: [
                { id: "src_a", domain: "gov.uk", age: "6h", quality: "primary" },
                { id: "src_b", domain: "reuters.com", age: "5h", quality: "secondary" },
              ],
            },
            {
              id: "s2",
              text: "Most mid-sized firms are unprepared for it.",
              state: "partial",
              sources: [{ id: "src_c", domain: "news.yc", age: "9h", quality: "forum" }],
            },
            {
              id: "s3",
              text: "It will halve compliance costs within a year.",
              state: "unsupported",
              sources: [],
            },
            {
              id: "s4",
              text: "I think the timing is the interesting part.",
              state: "opinion",
              sources: [],
              stance: "constraints beat scale",
            },
          ]}
        />
      </Section>

      <Section name="XPreviewCard" note="Stub. The platform type exception is declared inside the component.">
        <div className="space-y-3">
          <XPreviewCard handle="nova" displayName="Nova" text="A post that fits comfortably inside the limit." />
          <XPreviewCard handle="nova" displayName="Nova" text={"Over the limit. ".repeat(20)} />
        </div>
      </Section>

      <Section name="DiffList" note="Used by persona versioning in slice 2.">
        <DiffList
          entries={[
            { field: "Voice", before: "Direct, occasionally wry", after: "Direct, dry, never arch" },
            { field: "Pillar", before: null, after: "Regulatory drift" },
            { field: "Boundary", before: "No predictions", after: null },
          ]}
        />
      </Section>

      <InteractiveSections />
    </div>
  );
}

function InteractiveSections() {
  const toast = useToast();
  const { setOpen, setShortcutsOpen } = useCommands();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reasons, setReasons] = useState<string[]>(["off-voice"]);
  const [slider, setSlider] = useState(35);
  const [toggle, setToggle] = useState(true);
  const [radio, setRadio] = useState<"light" | "dark" | "system">("system");
  const [text, setText] = useState("");

  return (
    <>
      <Section name="NavRail" note="Active is a 2px left ink bar plus a weight change. No filled pill.">
        <div className="flex gap-8">
          <div className="w-[var(--sidebar-width)] border border-rule py-2">
            <NavRail items={NAV_ITEMS} />
          </div>
          <div className="w-[var(--sidebar-collapsed)] border border-rule py-2">
            <NavRail items={NAV_ITEMS} collapsed />
          </div>
        </div>
      </Section>

      <Section name="ReasonChips" note="Shown after a rejection. Selection is ink.">
        <ReasonChips
          reasons={[
            { id: "off-voice", label: "Not my voice" },
            { id: "said-before", label: "Said this already" },
            { id: "thin", label: "Evidence is thin" },
            { id: "boring", label: "Not worth saying" },
          ]}
          selected={reasons}
          onChange={setReasons}
        />
      </Section>

      <Section name="SliderRow" note="Both poles named, in mono.">
        <SliderRow name="Register" lowLabel="Plain" highLabel="Technical" value={slider} onChange={setSlider} />
      </Section>

      <Section name="Field, TextInput, Toggle, RadioRow">
        <Field label="Strong model" hint="Free text. Nothing here validates a model name for you.">
          <TextInput mono value={text} onChange={(e) => setText(e.target.value)} placeholder="claude-opus-4-6" />
        </Field>
        <Toggle label="Sandbox" description="Serve every model call from fixtures." checked={toggle} onChange={setToggle} />
        <Toggle label="Disabled toggle" checked disabled disabledReason="Pinned on by .env." onChange={() => {}} />
        <Field label="Theme">
          <RadioRow
            name="Theme"
            value={radio}
            onChange={setRadio}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ]}
          />
        </Field>
      </Section>

      <Section name="Toast" note="Bottom-left, three seconds, ink background.">
        <div className="mb-3 flex flex-wrap gap-3">
          <Button onClick={() => toast.show("Post copied.")}>Show a toast</Button>
          <Button onClick={() => toast.show("Research timed out after 30s. Retry, or write from what we have.", "failure")}>
            Show a failure toast
          </Button>
        </div>
        <div className="flex flex-col items-start gap-2">
          <Toast>Post copied.</Toast>
          <Toast tone="failure">Research timed out after 30s. Retry, or write from what we have.</Toast>
        </div>
      </Section>

      <Section name="SourceDrawer" note="420px slide-over from the right. Escape closes it.">
        <Button onClick={() => setDrawerOpen(true)}>Open the drawer</Button>
        <SourceDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Consultation paper" subtitle="example.org · 4 Aug">
          <p className="type-body text-ink-2">
            Source content lands here in slice 3: the retrieved passage, the domain, the date, and
            which sentences in the draft lean on it.
          </p>
        </SourceDrawer>
      </Section>

      <Section name="CommandPalette and shortcuts">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setOpen(true)}>Open the palette</Button>
          <Button onClick={() => setShortcutsOpen(true)}>Show shortcuts</Button>
        </div>
        <p className="type-small mt-2 text-ink-3">
          Or press Cmd/Ctrl K, or ?, or G then T.
        </p>
      </Section>

      <Section name="AppShell" note="You are inside it. Resize past 1100px and 768px to see the rail collapse and become a bottom bar." />
    </>
  );
}

function Section({ name, note, children }: { name: string; note?: string; children?: React.ReactNode }) {
  return (
    <section>
      <h2 className="type-h2 text-ink">{name}</h2>
      {note && <p className="type-small mt-1 mb-3 text-ink-3">{note}</p>}
      <div className={note ? "" : "mt-3"}>{children}</div>
    </section>
  );
}
