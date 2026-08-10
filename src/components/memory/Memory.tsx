"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { MicroLabel } from "@/components/common/MicroLabel";
import { SentenceManuscript, type ManuscriptSentence } from "@/components/common/SentenceManuscript";
import { SourceDrawer } from "@/components/common/SourceDrawer";
import { useRegisterCommands } from "@/components/common/command-registry";
import type { FeedbackSummary } from "@/domain/memory/feedback";
import { filterMemoryEntries } from "@/domain/memory/search";
import type { MemoryEntry } from "@/domain/memory/schema";
import type { PatternReport } from "@/domain/metrics/patterns";
import { cn } from "@/lib/format/cn";

interface Props {
  entries: MemoryEntry[];
  feedback: FeedbackSummary;
  patterns: PatternReport | null;
}

const CONTROL = "type-small min-w-0 rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink";

export function Memory({ entries, feedback, patterns }: Props) {
  const [tab, setTab] = useState<"memory" | "patterns">("memory");
  const [query, setQuery] = useState("");
  const [pillar, setPillar] = useState("");
  const [status, setStatus] = useState("");
  const [angle, setAngle] = useState("");
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);

  const pillars = useMemo(() => unique(entries.filter((entry) => entry.pillarId).map((entry) => [entry.pillarId!, entry.pillar] as const)), [entries]);
  const statuses = useMemo(() => [...new Set(entries.map((entry) => entry.status))].sort(), [entries]);
  const angles = useMemo(() => [...new Set(entries.map((entry) => entry.angle).filter(Boolean))].sort(), [entries]);
  const labels = useMemo(() => [...new Set(entries.flatMap((entry) => entry.feedbackLabels))].sort(), [entries]);
  const filtered = useMemo(() => filterMemoryEntries(entries, { query, pillar, status, angle, feedback: label, from, to }), [entries, query, pillar, status, angle, label, from, to]);
  const selectedSource = entries.flatMap((entry) => entry.sources).find((source) => source.id === sourceId) ?? null;

  function clearFilters() {
    setQuery(""); setPillar(""); setStatus(""); setAngle(""); setLabel(""); setFrom(""); setTo("");
  }

  useRegisterCommands([
    { id: "memory:search", label: "Search Memory", group: "Memory", shortcut: "/", run: () => document.getElementById("memory-search")?.focus() },
    { id: "memory:export-json", label: "Export Memory as JSON", group: "Memory", run: () => download("/api/memory/export?format=json") },
    { id: "memory:export-markdown", label: "Export published posts as markdown", group: "Memory", run: () => download("/api/memory/export?format=markdown") },
  ], []);

  if (tab === "patterns" && patterns) {
    return <div className="space-y-6"><MemoryTabs tab={tab} onTab={setTab} showPatterns /><Patterns report={patterns} /></div>;
  }

  return (
    <>
      {patterns && <MemoryTabs tab={tab} onTab={setTab} showPatterns />}
      <div className="space-y-4">
        <div className="grid gap-2 md:grid-cols-[minmax(330px,1.5fr)_repeat(4,minmax(180px,1fr))]">
          <input id="memory-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topic, thesis, or text…" aria-label="Search Memory" className={CONTROL} />
          <Filter label="Pillar" value={pillar} onChange={setPillar} options={pillars} />
          <Filter label="Status" value={status} onChange={setStatus} options={statuses.map((value) => [value, value])} />
          <Filter label="Angle" value={angle} onChange={setAngle} options={angles.map((value) => [value, value])} />
          <Filter label="Feedback" value={label} onChange={setLabel} options={labels.map((value) => [value, value])} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="type-small text-ink-3">From <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={cn(CONTROL, "ml-2")} /></label>
          <label className="type-small text-ink-3">To <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={cn(CONTROL, "ml-2")} /></label>
          <Button variant="quiet" onClick={clearFilters}>Clear filters</Button>
          <MicroLabel className="ml-auto">{filtered.length} of {entries.length}</MicroLabel>
        </div>
      </div>

      <FeedbackPanel summary={feedback} />

      {entries.length === 0 ? (
        <EmptyState action={<Link className="type-body-strong text-ink underline underline-offset-4" href="/today">Generate today’s recommendation</Link>}>
          Memory is empty. Accepted, rejected, and published work-and honest skip days-will appear here.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState action={<Button onClick={clearFilters}>Clear filters</Button>}>No Memory entries match these filters.</EmptyState>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-card border border-rule md:block">
            <table className="w-full border-collapse text-left">
              <thead className="bg-surface-sunken">
                <tr>{["Date", "Pillar", "Angle", "Status", "Chars", "Perf", "Text"].map((name) => <th key={name} scope="col" className="type-micro border-b border-rule px-3 py-2 text-ink-3">{name}</th>)}</tr>
              </thead>
              <tbody>{filtered.map((entry) => <MemoryTableRow key={entry.id} entry={entry} expanded={expanded === entry.id} onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)} onSource={setSourceId} />)}</tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((entry) => <MemoryCard key={entry.id} entry={entry} expanded={expanded === entry.id} onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)} onSource={setSourceId} />)}
          </div>
        </>
      )}

      <SourceDrawer open={Boolean(selectedSource)} onClose={() => setSourceId(null)} title={selectedSource?.title ?? "Source"} subtitle={selectedSource?.domain}>
        {selectedSource && <div className="space-y-4"><p className="type-data text-ink-3">{selectedSource.sourceQuality} · {selectedSource.publishedAt?.slice(0, 10) ?? "date unknown"}</p><a href={selectedSource.url} target="_blank" rel="noreferrer" className="type-body break-all text-ink underline underline-offset-4">Open original source</a></div>}
      </SourceDrawer>
    </>
  );
}

function MemoryTabs({ tab, onTab, showPatterns }: { tab: "memory" | "patterns"; onTab: (tab: "memory" | "patterns") => void; showPatterns: boolean }) {
  return <div role="tablist" aria-label="Memory views" className="flex gap-4 border-b border-rule"><button type="button" role="tab" aria-selected={tab === "memory"} onClick={() => onTab("memory")} className={cn("type-body-strong border-b-2 px-1 py-2", tab === "memory" ? "border-ink text-ink" : "border-transparent text-ink-3")}>Archive</button>{showPatterns && <button type="button" role="tab" aria-selected={tab === "patterns"} onClick={() => onTab("patterns")} className={cn("type-body-strong border-b-2 px-1 py-2", tab === "patterns" ? "border-ink text-ink" : "border-transparent text-ink-3")}>Patterns</button>}</div>;
}

function Patterns({ report }: { report: PatternReport }) {
  return <section aria-label="Observed performance patterns" className="space-y-4"><div><h2 className="type-h2 text-ink">Patterns</h2><p className="type-body mt-1 reading-column text-ink-2">Observations only. Engagement is one signal among quality, usefulness, consistency, and persona integrity.</p></div>{report.findings.length ? report.findings.map((finding) => <article key={finding.id} className="rounded-card border border-rule bg-surface p-4"><MicroLabel>Based on {finding.sampleSize} posts.</MicroLabel><p className="type-body mt-2 text-ink-2">{finding.observation}</p></article>) : <EmptyState>No observation clears the configured confidence floor. Nothing is inferred from weak differences.</EmptyState>}</section>;
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: ReadonlyArray<readonly [string, string]> }) {
  return <select aria-label={`Filter by ${label}`} value={value} onChange={(event) => onChange(event.target.value)} className={CONTROL}><option value="">{label} · all</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>;
}

function MemoryTableRow({ entry, expanded, onToggle, onSource }: RowProps) {
  return <>
    <tr className={cn("border-b border-rule last:border-b-0", entry.kind === "skip" && "bg-surface-sunken text-ink-3")}>
      <td data-mono className="type-data whitespace-nowrap px-3 py-3">{shortDate(entry.date)}</td>
      <td className="type-small px-3 py-3">{entry.pillar || "-"}</td>
      <td data-mono className="type-data px-3 py-3">{entry.angle || "-"}</td>
      <td data-mono className="type-micro px-3 py-3">{entry.status}</td>
      <td data-mono className="type-data px-3 py-3">{entry.characterCount ?? "-"}</td>
      <td data-mono className="type-data px-3 py-3">-</td>
      <td className="max-w-[660px] px-3 py-3"><button type="button" aria-expanded={expanded} onClick={onToggle} className="type-body block w-full text-left text-ink hover:text-ink-2"><span className="block truncate">{entry.text}</span>{entry.feedbackLabels.length > 0 && <span className="type-small mt-1 block truncate text-ink-3">↳ {entry.feedbackLabels.join(", ")}</span>}</button></td>
    </tr>
    {expanded && <tr><td colSpan={7} className="border-b border-rule bg-surface px-6 py-6"><MemoryDetail entry={entry} onSource={onSource} /></td></tr>}
  </>;
}

interface RowProps { entry: MemoryEntry; expanded: boolean; onToggle: () => void; onSource: (id: string) => void }

function MemoryCard({ entry, expanded, onToggle, onSource }: RowProps) {
  return <article className={cn("rounded-card border border-rule bg-surface", entry.kind === "skip" && "bg-surface-sunken")}><button type="button" aria-expanded={expanded} onClick={onToggle} className="block w-full p-4 text-left"><div className="flex items-center justify-between gap-3"><MicroLabel>{shortDate(entry.date)} · {entry.status}</MicroLabel><span data-mono className="type-data text-ink-3">{entry.characterCount ?? "-"}</span></div><p className="type-body mt-2 text-ink">{entry.text}</p>{entry.kind === "content" && <p className="type-small mt-2 text-ink-3">{entry.pillar} · {entry.angle || "Unassigned"}</p>}{entry.feedbackLabels.length > 0 && <p className="type-small mt-2 text-ink-3">↳ {entry.feedbackLabels.join(", ")}</p>}</button>{expanded && <div className="border-t border-rule p-4"><MemoryDetail entry={entry} onSource={onSource} /></div>}</article>;
}

function MemoryDetail({ entry, onSource }: { entry: MemoryEntry; onSource: (id: string) => void }) {
  if (entry.kind === "skip") return <div className="space-y-2"><MicroLabel>Honest skip</MicroLabel><p className="type-body text-ink-2">{entry.text}</p><p data-mono className="type-data text-ink-3">{entry.reasoning}</p>{entry.runId && <Link href={`/inspect#run-${entry.runId}`} className="type-small text-ink underline underline-offset-4">Open run in Inspector</Link>}</div>;
  const sourceById = new Map(entry.sources.map((source) => [source.id, source]));
  const sentences: ManuscriptSentence[] = entry.sentences.map((sentence) => ({
    id: sentence.id,
    text: sentence.text,
    state: sentence.claimType === "opinion" || sentence.claimType === "rhetorical" || sentence.support === "n/a" ? "opinion" : sentence.support,
    sources: sentence.sourceIds.flatMap((id) => { const source = sourceById.get(id); return source ? [{ id: source.id, domain: source.domain, age: source.publishedAt?.slice(0, 10) ?? "date unknown", quality: source.sourceQuality }] : []; }),
  }));
  return <div className="space-y-6"><SentenceManuscript sentences={sentences} onOpenSource={onSource} /><div className="grid gap-4 lg:grid-cols-3"><Meta label="Feedback">{entry.feedbackLabels.length ? entry.feedbackLabels.join(", ") : "No labels"}{entry.feedbackNote && <span className="mt-1 block">{entry.feedbackNote}</span>}</Meta><Meta label="Provenance">Persona version {entry.personaVersion}<br />Run {entry.runId}</Meta><Meta label="Sources">{entry.sources.length ? entry.sources.map((source) => <button key={source.id} type="button" onClick={() => onSource(source.id)} className="block max-w-full truncate text-left underline underline-offset-4">{source.domain}</button>) : "No stored sources"}</Meta></div><div><MicroLabel className="mb-1 block">Why this post</MicroLabel><p className="type-small text-ink-2">{entry.reasoning || "No reasoning was recorded."}</p></div><Link href={`/inspect#run-${entry.runId}`} className="type-small text-ink underline underline-offset-4">Open run in Inspector</Link></div>;
}

function Meta({ label, children }: { label: string; children: ReactNode }) { return <div><MicroLabel className="mb-1 block">{label}</MicroLabel><div className="type-small text-ink-2">{children}</div></div>; }

function FeedbackPanel({ summary }: { summary: FeedbackSummary }) {
  const labels = [...new Set([...Object.keys(summary.last30.rejectionLabels), ...Object.keys(summary.last90.rejectionLabels)])].sort();
  if (!labels.length && !summary.last90.unlabelledRejections && !summary.last90.radarDismissals) return null;
  return <section className="rounded-card border border-rule bg-surface p-4"><div className="mb-3 flex items-baseline justify-between"><MicroLabel>Feedback summary</MicroLabel><span className="type-small text-ink-3">Dismissed Radar cards are weak signals</span></div><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="type-micro py-1 text-ink-3">Label</th><th className="type-micro py-1 text-ink-3">30 days</th><th className="type-micro py-1 text-ink-3">90 days</th></tr></thead><tbody>{labels.map((item) => <tr key={item}><td className="type-small py-1 text-ink-2">{item}</td><td data-mono className="type-data py-1">{summary.last30.rejectionLabels[item] ?? 0}</td><td data-mono className="type-data py-1">{summary.last90.rejectionLabels[item] ?? 0}</td></tr>)}<tr><td className="type-small py-1 text-ink-2">Unlabelled rejection</td><td data-mono className="type-data py-1">{summary.last30.unlabelledRejections}</td><td data-mono className="type-data py-1">{summary.last90.unlabelledRejections}</td></tr><tr><td className="type-small py-1 text-ink-2">Radar dismissal · weak</td><td data-mono className="type-data py-1">{summary.last30.radarDismissals}</td><td data-mono className="type-data py-1">{summary.last90.radarDismissals}</td></tr></tbody></table></div></section>;
}

function unique(values: ReadonlyArray<readonly [string, string]>): Array<readonly [string, string]> { return [...new Map(values).entries()].sort((a, b) => a[1].localeCompare(b[1])); }
function shortDate(date: string): string { const parsed = new Date(`${date}T00:00:00`); return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(parsed); }
function download(url: string): void { const anchor = document.createElement("a"); anchor.href = url; anchor.download = ""; document.body.appendChild(anchor); anchor.click(); anchor.remove(); }
