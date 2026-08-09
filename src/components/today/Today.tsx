"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { MicroLabel } from "@/components/common/MicroLabel";
import { PipelineRail } from "@/components/common/PipelineRail";
import { ReasonChips } from "@/components/common/ReasonChips";
import { SentenceManuscript, type ManuscriptSentence } from "@/components/common/SentenceManuscript";
import { SourceDrawer } from "@/components/common/SourceDrawer";
import { useRegisterCommands } from "@/components/common/command-registry";
import { useToast } from "@/components/common/Toast";
import type { BudgetStatus } from "@/domain/budget/budget";
import type { Persona } from "@/domain/persona/schema";
import { isPersonaStarted } from "@/domain/persona/defaults";
import type { ContentItem, Source, StudioSession, Topic } from "@/domain/studio/schema";
import { TODAY_STAGES, type TodayRecord } from "@/domain/today/schema";
import { skipCardCopy } from "@/domain/today/presentation";
import { shortAge } from "@/components/studio/client";

const REASONS = [
  "too generic", "sounds like AI", "boring", "repetitive", "too promotional", "too formal",
  "too long", "weak idea", "factually risky", "wrong tone", "just don't like it",
].map((label) => ({ id: label, label }));

interface TodayPayload {
  record: TodayRecord | null;
  budget: BudgetStatus;
  content: ContentItem | null;
  topic: Topic | null;
  sources: Source[];
  session: StudioSession | null;
  resume: { date: string; contentId: string; sessionId: string | null } | null;
  autopsy: { contentId: string; text: string; publishedAt: string } | null;
}

interface TodayProps {
  persona: Persona;
  model: string;
  dateLabel: string;
  initial: TodayPayload;
}

type GenerateAction = "generate" | "alternative" | "search" | "evergreen" | "retry";

function optimisticRecord(previous: TodayRecord | null, action: GenerateAction): TodayRecord {
  if (action === "retry" && previous) {
    return {
      ...previous,
      status: "running",
      failure: null,
      stages: previous.stages.map((stage) => stage.state === "failed" ? { ...stage, state: "active", detail: "Retrying from here" } : stage),
      updatedAt: new Date().toISOString(),
    };
  }
  const now = new Date().toISOString();
  return {
    id: "today-pending",
    date: now.slice(0, 10),
    idempotencyKey: "pending",
    runId: null,
    status: "running",
    mode: action === "evergreen" ? "evergreen" : action === "search" ? "fresh" : "balanced",
    stages: TODAY_STAGES.map((stage, index) => ({ ...stage, state: index === 0 ? "active" : "pending", detail: index === 0 ? "Opening configured sources" : "" })),
    cadence: previous?.cadence ?? {
      sampleSize: 0, pillarDistribution: {}, angleDistribution: {},
      lengthDistribution: {}, openingDistribution: {}, debts: [], desiredAngle: null,
      missionLine: "Measuring the last fifteen published posts.",
    },
    contentId: null, topicId: null, sessionId: null, candidateIds: [], candidateIndex: 0,
    consideredCount: 0, rejectedSimilar: 0, rejectedWeak: 0, rejectedCandidates: 0,
    skipReason: "", failure: null, copiedAt: null, generatedAt: now, updatedAt: now,
  };
}

function epistemic(sentence: ContentItem["sentences"][number]): ManuscriptSentence["state"] {
  if (sentence.claimType === "opinion" || sentence.claimType === "rhetorical") return "opinion";
  if (sentence.support === "supported") return "supported";
  if (sentence.support === "partial") return "partial";
  return "unsupported";
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

export function Today({ persona, model, dateLabel, initial }: TodayProps) {
  const router = useRouter();
  const toast = useToast();
  const [payload, setPayload] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [budgetMessage, setBudgetMessage] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<string[]>([]);
  const [rejectNote, setRejectNote] = useState("");
  const [autopsy, setAutopsy] = useState(initial.autopsy);
  const refreshed = useRef(false);

  useEffect(() => {
    if (!autopsy) return;
    void fetch("/api/metrics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "prompt", contentId: autopsy.contentId }),
    }).catch(() => undefined);
  }, [autopsy]);

  const reload = useCallback(async () => {
    const response = await fetch("/api/today", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not refresh Today.");
    const next = await response.json() as TodayPayload;
    setPayload(next);
    return next;
  }, []);

  useEffect(() => {
    if (payload.record?.status !== "running") return;
    const timer = window.setInterval(() => void reload().catch(() => undefined), 600);
    return () => window.clearInterval(timer);
  }, [payload.record?.status, reload]);

  useEffect(() => {
    if (payload.record?.status === "running" || refreshed.current || !payload.record) return;
    refreshed.current = true;
    router.refresh();
  }, [payload.record, router]);

  const generate = useCallback(async (action: GenerateAction = "generate", override = false) => {
    const previous = payload;
    setBusy(true);
    setBudgetMessage("");
    refreshed.current = false;
    if (!payload.record || payload.record.status === "failed" || action !== "generate") {
      setPayload((current) => ({ ...current, record: optimisticRecord(current.record, action), content: null, topic: null, sources: [], session: null }));
    }
    try {
      const response = await fetch("/api/today", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, override, idempotencyKey: `today-${action}-${Date.now()}` }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPayload(previous);
        if (response.status === 429) setBudgetMessage(result.error ?? "Today is over budget.");
        else throw new Error(result.error ?? "Today could not start.");
        return;
      }
      setPayload(result as TodayPayload);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Today could not start.", "failure");
    } finally {
      setBusy(false);
    }
  }, [payload, toast]);

  const action = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch("/api/today/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "That action failed.");
    setPayload((current) => ({ ...current, record: result.record ?? current.record, content: result.content ?? current.content }));
    return result;
  }, []);

  const copy = useCallback(async () => {
    if (!payload.content) return;
    try {
      await navigator.clipboard.writeText(payload.content.text);
      await action({ action: "copy" });
      toast.show("Copied. Status unchanged.");
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Could not copy.", "failure");
    }
  }, [action, payload.content, toast]);

  const publish = useCallback(async () => {
    try {
      await action({ action: "publish", publicUrl: publicUrl.trim() || null });
      toast.show("Published.");
      router.refresh();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Could not mark published.", "failure");
    }
  }, [action, publicUrl, router, toast]);

  const reject = useCallback(async () => {
    try {
      await action({ action: "reject", reasons: [], note: "" });
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Could not reject.", "failure");
    }
  }, [action, toast]);

  const reviseInStudio = useCallback(async (kind: "rewrite" | "shorten") => {
    const session = payload.session;
    if (!session?.selectedDraftId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/studio/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          draftId: session.selectedDraftId,
          action: kind,
          idempotencyKey: `today-${kind}-${Date.now()}`,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "The revision failed.");
      router.push(`/studio?session=${encodeURIComponent(session.id)}`);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "The revision failed.", "failure");
    } finally {
      setBusy(false);
    }
  }, [payload.session, router, toast]);

  useRegisterCommands([
    { id: "today:generate", label: "Generate today's post", group: "Today", shortcut: "Enter", run: () => void generate("generate") },
    { id: "today:evergreen", label: "Generate an evergreen idea", group: "Today", run: () => void generate("evergreen") },
    { id: "today:bank", label: "Open the idea bank", group: "Today", run: () => router.push("/radar?tab=bank") },
    { id: "today:topic", label: "Give the AI a topic", group: "Today", run: () => router.push("/radar?seed=1") },
    { id: "today:radar", label: "Run a Radar scan", group: "Today", run: () => router.push("/radar?scan=1") },
  ], [generate, router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (event.key === "Enter" && !payload.record) { event.preventDefault(); void generate("generate"); }
      else if (key === "c" && payload.content && payload.record?.status === "recommendation") { event.preventDefault(); void copy(); }
      else if (key === "p" && payload.content && payload.record?.status === "recommendation") { event.preventDefault(); void publish(); }
      else if (key === "x" && payload.content && payload.record?.status === "recommendation") { event.preventDefault(); void reject(); }
      else if (key === "a" && payload.record && payload.record.status !== "running") { event.preventDefault(); void generate("alternative"); }
      else if (key === "s" && payload.record?.sessionId) { event.preventDefault(); router.push(`/studio?session=${encodeURIComponent(payload.record.sessionId)}`); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [copy, generate, payload.content, payload.record, publish, reject, router]);

  const pillars = persona.pillars.filter((pillar) => pillar.enabled);
  const overLimit = payload.budget.overBudget || payload.budget.atRunLimit;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-col gap-4 border-b border-rule pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="type-h1 text-ink">Good morning.</h1>
          <p data-mono className="type-data mt-1 text-ink-3">{dateLabel} · {persona.name || "Nova"} · {model}</p>
        </div>
        <Button
          variant="primary"
          disabled={busy || payload.record?.status === "running" || (overLimit && !payload.record)}
          title="Estimated daily run: ~12k–24k tokens"
          onClick={() => void generate("generate")}
        >
          {payload.record?.status === "running" ? "Generating…" : "Generate today's post"}
        </Button>
      </header>

      <section className="border-b border-rule py-5">
        <MicroLabel strong>Today’s mission</MicroLabel>
        <p className="type-body mt-2 text-ink">Find one genuinely interesting thing worth talking about.</p>
        <p data-mono className="type-data mt-1 text-ink-3">
          Pillars: {pillars.map((pillar) => `${pillar.name} ${pillar.weight}`).join(" · ") || "none yet"}
        </p>
        <p data-mono className="type-data mt-1 text-ink-3">
          Leaning: {payload.record?.mode ?? "balanced"} · {payload.record?.cadence.missionLine ?? "Cadence will be measured before selection."}
        </p>
        {payload.resume && !payload.record && (
          <p data-mono className="type-data mt-2 text-ink-2">
            You copied yesterday’s post but never marked it published. <button className="underline" onClick={() => payload.resume?.sessionId && router.push(`/studio?session=${encodeURIComponent(payload.resume.sessionId)}`)}>Resume it</button>
          </p>
        )}
        {budgetMessage && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="type-small text-ink-2">{budgetMessage}</p>
            <Button variant="secondary" onClick={() => void generate("generate", true)}>Run anyway</Button>
          </div>
        )}
        {!budgetMessage && overLimit && !payload.record && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="type-small text-ink-2">Today’s budget or run limit is spent. Generate is disabled until you explicitly run anyway.</p>
            <Button variant="secondary" onClick={() => void generate("generate", true)}>Run anyway</Button>
          </div>
        )}
      </section>

      {autopsy && <AutopsyPrompt autopsy={autopsy} onDone={() => setAutopsy(null)} />}

      <div className="py-6">
        {!isPersonaStarted(persona) ? (
          <EmptyState>Identity comes before generation. Finish onboarding or load the Nova demo persona from Brain.</EmptyState>
        ) : !payload.record ? (
          <EmptyState>One keypress is enough. Press Enter or generate today’s post.</EmptyState>
        ) : payload.record.status === "running" || payload.record.status === "failed" ? (
          <PipelineCard record={payload.record} onRetry={() => void generate("retry")} />
        ) : payload.record.status === "skip" ? (
          <SkipCard record={payload.record} onGenerate={generate} onBank={() => router.push("/radar?tab=bank")} onTopic={() => router.push("/radar?seed=1")} />
        ) : payload.record.status === "rejected" ? (
          <RejectedCard
            reasons={rejectReasons}
            note={rejectNote}
            onReasons={setRejectReasons}
            onNote={setRejectNote}
            onSave={() => void action({ action: "feedback", reasons: rejectReasons, note: rejectNote }).then(() => toast.show("Feedback saved."))}
            onUndo={() => void action({ action: "undo-reject" }).then(() => toast.show("Rejection undone."))}
            onAlternative={() => void generate("alternative")}
          />
        ) : payload.content && payload.topic ? (
          <Recommendation
            payload={payload}
            persona={persona}
            publicUrl={publicUrl}
            busy={busy}
            onPublicUrl={setPublicUrl}
            onSource={setSelectedSource}
            onCopy={copy}
            onPublish={publish}
            onReject={reject}
            onAlternative={() => void generate("alternative")}
            onStudio={() => payload.record?.sessionId && router.push(`/studio?session=${encodeURIComponent(payload.record.sessionId)}`)}
            onImprove={() => void reviseInStudio("rewrite")}
            onShorten={() => void reviseInStudio("shorten")}
          />
        ) : (
          <EmptyState>The daily result points to a post that is no longer on disk. Generate an alternative to continue.</EmptyState>
        )}
      </div>

      <SourceDetails source={payload.sources.find((source) => source.id === selectedSource) ?? null} onClose={() => setSelectedSource(null)} />
    </div>
  );
}

const METRIC_FIELDS = [
  ["impressions", "Impressions"], ["likes", "Likes"], ["replies", "Replies"],
  ["reposts", "Reposts"], ["bookmarks", "Bookmarks"], ["profileVisits", "Profile visits"],
  ["followersGained", "Followers gained"],
] as const;

function AutopsyPrompt({ autopsy, onDone }: { autopsy: NonNullable<TodayPayload["autopsy"]>; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<(typeof METRIC_FIELDS)[number][0], string>>({
    impressions: "", likes: "", replies: "", reposts: "", bookmarks: "", profileVisits: "", followersGained: "",
  });

  async function submit(action: "save" | "skip") {
    const metrics = Object.fromEntries(METRIC_FIELDS.map(([key]) => [key, values[key] === "" ? null : Math.max(0, Number(values[key]) || 0)]));
    const response = await fetch("/api/metrics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, contentId: autopsy.contentId, metrics }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.show(body.error ?? "The numbers could not be saved.", "failure");
      return;
    }
    toast.show(action === "save" ? "Numbers saved as an observation." : "Skipped. This will not be asked again.");
    onDone();
  }

  return (
    <section className="border-b border-rule py-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="type-small text-ink-3">It has been seven days since “{autopsy.text.slice(0, 72)}{autopsy.text.length > 72 ? "…" : ""}” was published.</p>
        <button type="button" onClick={() => setOpen((value) => !value)} className="type-small text-ink underline underline-offset-4">Add its numbers</button>
        <button type="button" onClick={() => void submit("skip")} className="type-small text-ink-3">Skip</button>
      </div>
      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {METRIC_FIELDS.map(([key, label]) => (
            <label key={key} className="type-small text-ink-3">{label}
              <input type="number" min={0} inputMode="numeric" value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} className="type-data mt-1 w-full rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink" />
            </label>
          ))}
          <div className="flex items-end"><Button onClick={() => void submit("save")}>Save numbers</Button></div>
        </div>
      )}
    </section>
  );
}

function PipelineCard({ record, onRetry }: { record: TodayRecord; onRetry: () => void }) {
  return (
    <Card padding="24" label="Daily run">
      <PipelineRail stages={record.stages.map((stage) => ({ name: stage.name, state: stage.state, detail: stage.detail }))} />
      {record.failure && (
        <div className="mt-5 border-t border-rule pt-4">
          <p className="type-body text-unsupported">{record.failure.message}</p>
          <Button variant="secondary" className="mt-3" onClick={onRetry}>Retry from {record.failure.stage}</Button>
        </div>
      )}
    </Card>
  );
}

function SkipCard({ record, onGenerate, onBank, onTopic }: { record: TodayRecord; onGenerate: (action: GenerateAction) => void; onBank: () => void; onTopic: () => void }) {
  const copy = skipCardCopy(record);
  return (
    <Card padding="24" label="No recommendation">
      <h2 className="type-h2 text-ink">{copy.heading}</h2>
      <p className="type-body reading-column mt-4 text-ink-2">{copy.explanation}</p>
      <div className="mt-6 flex flex-wrap gap-2 border-t border-rule pt-4">
        <Button variant="primary" title="Estimated ~12k–24k tokens" onClick={() => onGenerate("search")}>Search again</Button>
        <CostAction label="Generate an evergreen idea" estimate="~10k–20k tokens" onClick={() => onGenerate("evergreen")} />
        <Button variant="quiet" onClick={onBank}>Open Idea Bank</Button>
        <Button variant="quiet" onClick={onTopic}>Give me a topic</Button>
      </div>
    </Card>
  );
}

function RejectedCard(props: {
  reasons: string[];
  note: string;
  onReasons: (reasons: string[]) => void;
  onNote: (note: string) => void;
  onSave: () => void;
  onUndo: () => void;
  onAlternative: () => void;
}) {
  return (
    <Card padding="24" label="Rejected">
      <div tabIndex={-1} className="outline-none">
        <h2 className="type-h2 text-ink">Not this one.</h2>
        <p className="type-small mt-2 text-ink-3">A reason is optional. This tunes selection, never identity.</p>
        <ReasonChips reasons={REASONS} selected={props.reasons} onChange={props.onReasons} className="mt-4" />
        <input
          autoFocus
          value={props.note}
          onChange={(event) => props.onNote(event.target.value)}
          placeholder="Optional note"
          className="type-body mt-3 w-full rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={props.onSave}>Save feedback</Button>
          <Button variant="quiet" onClick={props.onUndo}>Undo</Button>
          <CostAction label="Generate alternative" estimate="~12k–24k tokens" onClick={props.onAlternative} />
        </div>
      </div>
    </Card>
  );
}

function Recommendation(props: {
  payload: TodayPayload;
  persona: Persona;
  publicUrl: string;
  busy: boolean;
  onPublicUrl: (value: string) => void;
  onSource: (id: string) => void;
  onCopy: () => void;
  onPublish: () => void;
  onReject: () => void;
  onAlternative: () => void;
  onStudio: () => void;
  onImprove: () => void;
  onShorten: () => void;
}) {
  const { content, topic, sources, session, record } = props.payload;
  if (!content || !topic || !record) return null;
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const manuscript: ManuscriptSentence[] = content.sentences.map((sentence) => ({
    id: sentence.id,
    text: sentence.text,
    state: epistemic(sentence),
    stance: sentence.claimType === "opinion" ? props.persona.beliefs.find((belief) => belief.enabled)?.statement : undefined,
    sources: sentence.sourceIds.flatMap((id) => {
      const source = sourceById.get(id);
      return source ? [{ id: source.id, domain: source.domain, age: shortAge(source.publishedAt), quality: source.sourceQuality }] : [];
    }),
  }));
  const pillar = props.persona.pillars.find((item) => item.id === topic.pillarId)?.name ?? "Unassigned";
  const closest = content.similarity?.result.matches[0];
  const similarity = content.similarity?.result.risk === "low"
    ? `Low. ${closest ? `Closest prior post is ${Math.round(closest.score * 100)}% overlap.` : `No material overlap across ${content.similarity.result.comparedAgainst} prior posts.`}`
    : `${content.similarity?.result.risk ?? "Unknown"}. ${closest?.note ?? "Review the overlap before publishing."}`;

  return (
    <Card padding="24" className="relative">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
        <MicroLabel>{pillar} · {content.angle} · {topic.freshness}</MicroLabel>
        <div className="flex flex-wrap gap-4">
          <MicroLabel strong>{content.critique?.personaFit ?? "checked"}</MicroLabel>
          <MicroLabel>{sources.length} sources</MicroLabel>
          <MicroLabel>{content.characterCount} ch</MicroLabel>
        </div>
      </div>

      <SentenceManuscript sentences={manuscript} onOpenSource={props.onSource} className="py-5" />

      <dl className="space-y-3 border-t border-rule py-4">
        <ReasonRow label="Why this topic" text={topic.fitReason || `It cleared the evidence and memory checks after ${record.consideredCount} candidates were considered.`} />
        <ReasonRow label="Why this angle" text={session?.anglePick?.reasoning || record.cadence.missionLine} />
        <ReasonRow label="Similarity" text={similarity} />
      </dl>

      <div className="flex flex-col gap-3 border-t border-rule pt-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={props.onCopy}>Copy post</Button>
          <Button variant="quiet" onClick={props.onStudio}>Open in Studio</Button>
          <CostAction label="Improve" estimate="~2k–5k tokens" onClick={props.onImprove} disabled={props.busy} />
          <CostAction label="Shorten" estimate="~2k–5k tokens" onClick={props.onShorten} disabled={props.busy} />
          <CostAction label="Alternative" estimate="~12k–24k tokens" onClick={props.onAlternative} disabled={props.busy} />
          <Button variant="quiet" onClick={props.onReject}>Reject</Button>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <input
            data-mono
            value={props.publicUrl}
            onChange={(event) => props.onPublicUrl(event.target.value)}
            placeholder="Optional public URL"
            disabled={content.status === "published"}
            className="type-data min-w-0 rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink"
          />
          <Button variant="secondary" disabled={content.status === "published"} onClick={props.onPublish}>
            {content.status === "published" ? "Published" : "Mark published"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ReasonRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt><MicroLabel>{label}</MicroLabel></dt>
      <dd className="type-body text-ink-2">{text}</dd>
    </div>
  );
}

function CostAction({ label, estimate, onClick, disabled = false }: { label: string; estimate: string; onClick: () => void; disabled?: boolean }) {
  return (
    <span className="group relative inline-flex">
      <Button variant="quiet" disabled={disabled} onClick={onClick} aria-describedby={`cost-${label.replace(/\s+/g, "-")}`}>{label}</Button>
      <span id={`cost-${label.replace(/\s+/g, "-")}`} role="tooltip" data-mono className="type-micro pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden whitespace-nowrap rounded-control border border-rule bg-surface px-2 py-1 text-ink-2 shadow-pop group-hover:block group-focus-within:block">
        Estimated {estimate}
      </span>
    </span>
  );
}

function SourceDetails({ source, onClose }: { source: Source | null; onClose: () => void }) {
  return (
    <SourceDrawer open={Boolean(source)} onClose={onClose} title={source?.title ?? "Source"} subtitle={source ? `${source.domain} · ${shortAge(source.publishedAt)}` : undefined}>
      {source && (
        <div className="space-y-4">
          <p className="type-body text-ink-2">{source.excerpt}</p>
          <a href={source.url} target="_blank" rel="noreferrer" className="type-data break-all text-ink hover:underline">{source.url}</a>
          <p data-mono className="type-data text-ink-3">{source.sourceQuality} · {source.providerId}</p>
        </div>
      )}
    </SourceDrawer>
  );
}
