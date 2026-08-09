"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/common/Button";
import { Card, CardSection } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { MicroLabel } from "@/components/common/MicroLabel";
import { PipelineRail, type PipelineStage } from "@/components/common/PipelineRail";
import { ScoreBar } from "@/components/common/ScoreBar";
import { useToast } from "@/components/common/Toast";
import type { Pillar } from "@/domain/persona/schema";
import type { RadarSettings } from "@/domain/settings/schema";
import type { RadarScoreComponents, Source, Topic } from "@/domain/studio/schema";
import type { ProviderReport, RadarScanResult } from "@/domain/radar/schema";
import { cn } from "@/lib/format/cn";

type Tab = "fresh" | "evergreen" | "bank";
const SEED_KEY = "persona-studio:radar-seed";
const SCORE_NAMES: Array<[keyof RadarScoreComponents, string]> = [
  ["personaRelevance", "relevance"], ["novelty", "novelty"], ["freshness", "freshness"],
  ["sourceQuality", "sources"], ["usefulness", "usefulness"], ["angleStrength", "angle"],
  ["claimRisk", "claim safety"], ["diversityContribution", "diversity"],
];

interface RadarProps {
  initialTopics: Topic[];
  initialSources: Source[];
  pillars: Pillar[];
  providerSettings: RadarSettings["providers"];
  initialTab?: Tab;
  runOnMount?: boolean;
  focusSeed?: boolean;
}

export function Radar({ initialTopics, initialSources, pillars, providerSettings, initialTab = "fresh", runOnMount = false, focusSeed = false }: RadarProps) {
  const router = useRouter();
  const toast = useToast();
  const [topics, setTopics] = useState(initialTopics);
  const [sources, setSources] = useState(initialSources);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [seed, setSeed] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<RadarScanResult | null>(null);
  const [progressReports, setProgressReports] = useState<ProviderReport[]>([]);
  const [progressStage, setProgressStage] = useState<string | null>(null);
  const seedRef = useRef<HTMLInputElement>(null);
  const autoRan = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(SEED_KEY);
    if (stored) queueMicrotask(() => setSeed(stored));
  }, []);
  useEffect(() => { if (seed) window.localStorage.setItem(SEED_KEY, seed); else window.localStorage.removeItem(SEED_KEY); }, [seed]);
  useEffect(() => {
    if (focusSeed) seedRef.current?.focus();
    if (runOnMount && !autoRan.current) {
      autoRan.current = true;
      void runScan();
    }
    // These are route-entry instructions and intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lists = useMemo(() => ({
    fresh: topics.filter((topic) => topic.status !== "banked" && topic.radarKind === "fresh"),
    evergreen: topics.filter((topic) => topic.status !== "banked" && topic.radarKind === "evergreen"),
    bank: topics.filter((topic) => topic.status === "banked"),
  }), [topics]);
  const visible = lists[tab];

  async function runScan() {
    setBusy("scan");
    setScanResult(null);
    setProgressReports([]);
    setProgressStage(null);
    try {
      const response = await fetch("/api/radar/scan", {
        method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify({ idempotencyKey: `radar-${Date.now()}` }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "The scan failed.");
      }
      let result: RadarScanResult | null = null;
      if (response.headers.get("content-type")?.includes("application/x-ndjson") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const message = JSON.parse(line);
            if (message.type === "progress" && message.event?.phase === "provider") {
              setProgressReports((current) => mergeReports(current, message.event.report));
            } else if (message.type === "progress" && message.event?.phase === "stage") {
              setProgressStage(message.event.stage);
            } else if (message.type === "result") result = message.result;
            else if (message.type === "error") throw new Error(message.error);
          }
          if (done) break;
        }
      } else {
        const body = await response.json();
        if (body.replayed) { router.refresh(); return; }
        result = body;
      }
      if (!result) throw new Error("The scan ended without a result.");
      setScanResult(result);
      setTopics((current) => mergeById(current, result.topics));
      setSources((current) => mergeById(current, result.sources));
      if (result.topics.some((topic) => topic.radarKind === "fresh" && topic.status !== "banked")) setTab("fresh");
      else if (result.topics.some((topic) => topic.radarKind === "evergreen" && topic.status !== "banked")) setTab("evergreen");
      toast.show(result.recommendation === "skip" ? "Scan complete. Nothing cleared the bar." : "Radar scan complete.");
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "The scan failed.", "failure");
    } finally {
      setBusy(null);
    }
  }

  async function act(body: Record<string, unknown>) {
    setBusy(String(body.action));
    try {
      const response = await fetch("/api/radar/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "That action failed.");
      if (payload.topic) setTopics((current) => mergeById(current, [payload.topic]));
      if (body.action === "dismiss") setTopics((current) => current.filter((topic) => topic.id !== body.topicId));
      if (body.action === "seed") { setSeed(""); window.localStorage.removeItem(SEED_KEY); }
      if (payload.sessionId) router.push(`/studio?session=${encodeURIComponent(payload.sessionId)}`);
      return payload;
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "That action failed.", "failure");
      return null;
    } finally {
      setBusy(null);
    }
  }

  if (busy === "scan") {
    return <ScanProgress providerSettings={providerSettings} reports={progressReports} currentStage={progressStage} />;
  }

  return (
    <div className="space-y-4">
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (seed.trim()) void act({ action: "seed", text: seed.trim() }); }}>
        <input
          ref={seedRef}
          className="type-body min-w-0 grow rounded-control border border-rule-strong bg-surface px-3 py-2 placeholder:text-ink-3"
          value={seed} onChange={(event) => setSeed(event.target.value)}
          placeholder="Type an idea you have been sitting on…" aria-label="Idea seed"
        />
        <Button type="submit" variant="primary" disabled={!seed.trim() || busy !== null}>Explore</Button>
      </form>

      <div className="flex flex-col gap-3 border-b border-rule pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex max-w-full gap-1 overflow-x-auto" role="tablist" aria-label="Radar topics">
          <TabButton active={tab === "fresh"} onClick={() => setTab("fresh")}>Fresh ({lists.fresh.length})</TabButton>
          <TabButton active={tab === "evergreen"} onClick={() => setTab("evergreen")}>Evergreen ({lists.evergreen.length})</TabButton>
          <TabButton active={tab === "bank"} onClick={() => setTab("bank")}>Bank ({lists.bank.length})</TabButton>
        </div>
        <Button onClick={runScan} disabled={busy !== null}>Run scan</Button>
      </div>

      {scanResult?.recommendation === "skip" && (
        <Card label="Scan complete" padding="24">
          <h2 className="type-h2">Nothing worth forcing today.</h2>
          <p className="type-body mt-2 text-ink-2">{scanResult.reason}</p>
          <MicroLabel className="mt-4 block">{scanResult.consideredCount} considered · {scanResult.rejectedFor.similar} similar · {scanResult.rejectedFor.weak} weak</MicroLabel>
        </Card>
      )}

      {visible.length === 0 ? (
        <EmptyState>No topics yet. Run a scan, or type an idea you have been sitting on.</EmptyState>
      ) : (
        <div className="space-y-3">
          {visible.map((topic) => (
            <TopicCard
              key={topic.id} topic={topic} pillar={pillars.find((pillar) => pillar.id === topic.pillarId)}
              sources={sources.filter((source) => source.topicId === topic.id)} expanded={expanded === topic.id}
              onToggle={() => setExpanded((current) => current === topic.id ? null : topic.id)}
              onExplore={() => void act({ action: "explore", topicId: topic.id })}
              onDismiss={() => void act({ action: "dismiss", topicId: topic.id })}
              onBank={topic.status === "banked" ? undefined : () => void act({ action: "bank", topicId: topic.id })}
              busy={busy !== null}
            />
          ))}
        </div>
      )}

      {scanResult && <ProviderSummary reports={scanResult.providers} runId={scanResult.runId} />}
    </div>
  );
}

function ScanProgress({ providerSettings, reports, currentStage }: {
  providerSettings: RadarSettings["providers"]; reports: ProviderReport[]; currentStage: string | null;
}) {
  const names: Array<[keyof typeof providerSettings, string]> = [
    ["nativeModelSearch", "Native model search"], ["hackerNews", "Hacker News"], ["reddit", "Reddit"],
    ["arxiv", "arXiv"], ["github", "GitHub"], ["devCommunity", "DEV Community"],
    ["lobsters", "Lobsters"], ["openAlex", "OpenAlex"], ["rss", "RSS / Atom"],
  ];
  const firstWaiting = names.find(([key]) => providerSettings[key].enabled && !reports.some((report) => report.id === providerId(key)))?.[0];
  const stateFor = (stage: string): PipelineStage["state"] => {
    const order = ["novelty", "fast", "strong", "bank"];
    if (!currentStage) return "pending";
    const current = order.indexOf(currentStage);
    const index = order.indexOf(stage);
    return index < current ? "done" : index === current ? "active" : "pending";
  };
  const stages: PipelineStage[] = [
    ...names.map(([key, name]) => {
      const report = reports.find((item) => item.id === providerId(key));
      if (!providerSettings[key].enabled) return { name, state: "skipped" as const, detail: "disabled" };
      if (!report) return { name, state: key === firstWaiting ? "active" as const : "pending" as const, detail: key === firstWaiting ? "checking" : undefined };
      return { name, state: report.status === "degraded" ? "failed" as const : "done" as const, detail: report.status === "degraded" ? "degraded" : `${report.resultCount} results` };
    }),
    { name: "Deduplicate and novelty", state: stateFor("novelty") }, { name: "Persona fit", state: stateFor("fast") },
    { name: "Top-five angle check", state: stateFor("strong") }, { name: "Threshold and bank", state: stateFor("bank") },
  ];
  return <Card label="Radar scan" padding="24"><PipelineRail stages={stages} /></Card>;
}

function TopicCard({ topic, pillar, sources, expanded, onToggle, onExplore, onDismiss, onBank, busy }: {
  topic: Topic; pillar?: Pillar; sources: Source[]; expanded: boolean; onToggle: () => void;
  onExplore: () => void; onDismiss: () => void; onBank?: () => void; busy: boolean;
}) {
  const scores = topic.scoreComponents;
  return (
    <Card padding="24" label={<>{topic.scoreLabel ?? "Unscored"} · {pillar?.name ?? "No pillar"} · {topic.radarKind ?? topic.sourceType}{topic.status === "banked" ? ` · banked ${age(topic.bankedAt ?? null)} ago` : ""}</>}>
      <button type="button" className="w-full text-left" onClick={onToggle} aria-expanded={expanded}>
        <h2 className="type-h2">{topic.title}</h2>
        {topic.summary && <p className="type-small mt-1 text-ink-3">{sources[0]?.domain ? `${sources[0].domain} · ` : ""}{dateLabel(sources[0]?.publishedAt ?? null)}</p>}
        <p className="type-body mt-3 text-ink-2">{topic.fitReason || topic.summary}</p>
        {topic.angle && <p className="type-small mt-2 text-ink-2"><span className="text-ink-3">Angle:</span> {topic.angle}</p>}
      </button>
      {scores && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <ScoreBar label="relevance" value={scores.personaRelevance / 100} showValue={false} />
          <ScoreBar label="novelty" value={scores.novelty / 100} showValue={false} />
          <ScoreBar label="sources" value={scores.sourceQuality / 100} showValue={false} />
        </div>
      )}
      {expanded && scores && (
        <div className="mt-4 border-t border-rule pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SCORE_NAMES.map(([key, label]) => <ScoreBar key={key} label={label} value={scores[key] / 100} showValue={false} />)}
          </div>
          <CardSection label="Sources" className="mt-4">
            {sources.length === 0 ? <p className="type-small text-ink-3">Evergreen idea - no current source required.</p> : (
              <ul className="space-y-2">
                {sources.map((source) => (
                  <li key={source.id} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                    <a className="type-small text-ink underline underline-offset-2" href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                    <MicroLabel>{source.sourceQuality} · {source.providerId}</MicroLabel>
                  </li>
                ))}
              </ul>
            )}
          </CardSection>
        </div>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-rule pt-3">
        {onBank && <Button variant="quiet" disabled={busy} onClick={onBank}>Bank</Button>}
        <Button variant="primary" disabled={busy} onClick={onExplore}>Explore</Button>
        <Button variant="quiet" aria-label={`Dismiss ${topic.title}`} disabled={busy} onClick={onDismiss}>×</Button>
      </div>
    </Card>
  );
}

function ProviderSummary({ reports, runId }: { reports: ProviderReport[]; runId: string }) {
  return (
    <Card label="Provider report">
      <ul data-mono className="type-data space-y-1 text-ink-2">
        {reports.map((report) => <li key={report.id} className="flex justify-between gap-4"><span>{report.id}</span><span>{report.status} · {report.resultCount}</span></li>)}
      </ul>
      <a href={`/inspect#${runId}`} className="type-small mt-3 inline-block text-ink underline underline-offset-2">Inspect the complete scan</a>
    </Card>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button role="tab" aria-selected={active} onClick={onClick} className={cn("type-body-strong shrink-0 rounded-control px-3 py-2", active ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-sunken hover:text-ink")}>{children}</button>;
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()];
}

function mergeReports(current: ProviderReport[], incoming: ProviderReport): ProviderReport[] {
  return [...current.filter((item) => item.id !== incoming.id), incoming];
}

function providerId(key: keyof RadarSettings["providers"]): string {
  return ({ nativeModelSearch: "native-model-search", hackerNews: "feeds:hacker-news", reddit: "feeds:reddit", arxiv: "feeds:arxiv", github: "feeds:github", devCommunity: "feeds:dev-community", lobsters: "feeds:lobsters", openAlex: "feeds:openalex", rss: "feeds:rss" } as const)[key];
}

function age(value: string | null): string {
  if (!value) return "recently";
  const hours = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 3600000));
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function dateLabel(value: string | null): string {
  if (!value) return "date unknown";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(value));
}
