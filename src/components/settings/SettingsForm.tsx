"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/common/Button";
import { Card, CardSection } from "@/components/common/Card";
import { Field, RadioRow, TextInput, Toggle } from "@/components/common/Field";
import { MicroLabel } from "@/components/common/MicroLabel";
import { useToast } from "@/components/common/Toast";
import { formatBytes, formatMs, formatRelative } from "@/lib/format/display";
import { formatCost } from "@/services/ai/pricing";
import type { Pillar } from "@/domain/persona/schema";
import { RADAR_SCORE_KEYS, type RadarSettings, type Settings, type Theme } from "@/domain/settings/schema";
import type { ProviderReport } from "@/domain/radar/schema";

interface DataInfo {
  path: string;
  files: number;
  bytes: number;
  fixtures: number;
}

interface ConnectionResult {
  ok: boolean;
  sandbox?: boolean;
  model?: string;
  latencyMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  costEstimate?: number;
  reply?: string;
  runId?: string;
  error?: string;
}

interface SettingsFormProps {
  initial: Settings;
  data: DataInfo;
  /** SANDBOX_MODE=true in .env pins sandbox on and the toggle off. */
  sandboxForcedByEnv: boolean;
  modelOverrides: { strong: string | null; fast: string | null; baseUrl: string | null };
  hasPersona: boolean;
  pillars: Pillar[];
  gitSyncEnabled: boolean;
}

export function SettingsForm({ initial, data, sandboxForcedByEnv, modelOverrides, hasPersona, pillars, gitSyncEnabled }: SettingsFormProps) {
  const toast = useToast();
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const update = useCallback((changes: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...changes }));
    setDirty(true);
  }, []);

  // The theme applies the moment you pick it, before you save, because a
  // preview you have to commit to is not a preview.
  useEffect(() => {
    document.documentElement.dataset.theme = settings.appearance.theme;
  }, [settings.appearance.theme]);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.show(body.error ?? "Settings could not be saved.", "failure");
        return;
      }
      setSettings(body);
      setDirty(false);
      toast.show("Settings saved to disk.");
      router.refresh();
    } catch (err) {
      toast.show(`Settings could not be saved: ${(err as Error).message}`, "failure");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ModelSection settings={settings} update={update} overrides={modelOverrides} />
      <BudgetSection settings={settings} update={update} />
      <SourcesSection settings={settings} update={update} pillars={pillars} />
      <SandboxSection
        settings={settings}
        update={update}
        fixtures={data.fixtures}
        forcedByEnv={sandboxForcedByEnv}
      />

      <MemorySection settings={settings} update={update} />
      <PersonaSection hasPersona={hasPersona} />
      <DataSection data={data} settings={settings} gitSyncEnabled={gitSyncEnabled} />
      <DangerZone />

      {/* Sticky, so the save is reachable from any section without scrolling
          back. It carries its own ground and rule; a floating button over
          transparent content would let the form show through it. */}
      <div className="sticky bottom-0 -mx-6 mt-4 flex items-center gap-3 border-t border-rule bg-bg px-6 py-3">
        <Button variant="primary" onClick={save} disabled={saving || !dirty}>
          {saving ? "Saving" : "Save settings"}
        </Button>
        {dirty && <MicroLabel>unsaved changes</MicroLabel>}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- sources -- */

const PROVIDERS: Array<[keyof RadarSettings["providers"], string]> = [
  ["nativeModelSearch", "Native model search"], ["hackerNews", "Hacker News"],
  ["reddit", "Reddit"], ["arxiv", "arXiv"], ["github", "GitHub"],
  ["devCommunity", "DEV Community"], ["lobsters", "Lobsters"], ["openAlex", "OpenAlex"], ["rss", "RSS / Atom"],
];

function list(value: string): string[] {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function SourcesSection({ settings, update, pillars }: {
  settings: Settings; update: (c: Partial<Settings>) => void; pillars: Pillar[];
}) {
  const toast = useToast();
  const radar = settings.radar;
  const [testing, setTesting] = useState(false);
  const [reports, setReports] = useState<ProviderReport[] | null>(null);
  const setRadar = (next: RadarSettings) => update({ radar: next });
  const setProvider = (key: keyof RadarSettings["providers"], enabled: boolean) => setRadar({
    ...radar, providers: { ...radar.providers, [key]: { ...radar.providers[key], enabled } },
  });

  async function testProviders() {
    setTesting(true);
    try {
      const response = await fetch("/api/radar/providers", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Provider test failed.");
      setReports(body.providers);
      toast.show("Provider test complete.");
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Provider test failed.", "failure");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card label="Sources" padding="24">
      <p className="type-small text-ink-3">All feed providers work without credentials and cache responses for 30 minutes. Optional GitHub and Reddit credentials in .env raise limits and reliability.</p>
      <div className="mt-3 divide-y divide-rule">
        {PROVIDERS.map(([key, label]) => {
          const state = radar.providers[key];
          const report = reports?.find((item) => item.id === providerId(key));
          return (
            <Toggle key={key} label={label}
              description={`${report?.status ?? state.lastStatus} · ${report?.resultCount ?? state.lastResultCount} results · ${report?.message ?? state.lastMessage}`}
              checked={state.enabled} onChange={(enabled) => setProvider(key, enabled)} />
          );
        })}
      </div>

      <CardSection label="Feed configuration" className="mt-4">
        <div className="grid gap-x-4 md:grid-cols-2">
          <Field label="Hacker News keywords" hint="Comma-separated.">
            <TextInput value={radar.hackerNews.keywords.join(", ")} onChange={(event) => setRadar({ ...radar, hackerNews: { ...radar.hackerNews, keywords: list(event.target.value) } })} />
          </Field>
          <Field label="Hacker News minimum points">
            <TextInput mono type="number" min={0} value={radar.hackerNews.minPoints} onChange={(event) => setRadar({ ...radar, hackerNews: { ...radar.hackerNews, minPoints: Math.max(0, Number(event.target.value) || 0) } })} />
          </Field>
          <Field label="Subreddits" hint="Names only, comma-separated.">
            <TextInput value={radar.reddit.subreddits.join(", ")} onChange={(event) => setRadar({ ...radar, reddit: { subreddits: list(event.target.value) } })} />
          </Field>
          <Field label="arXiv categories">
            <TextInput mono value={radar.arxiv.categories.join(", ")} onChange={(event) => setRadar({ ...radar, arxiv: { categories: list(event.target.value) } })} />
          </Field>
          <Field label="GitHub languages">
            <TextInput value={radar.github.languages.join(", ")} onChange={(event) => setRadar({ ...radar, github: { ...radar.github, languages: list(event.target.value) } })} />
          </Field>
          <Field label="GitHub topics">
            <TextInput value={radar.github.topics.join(", ")} onChange={(event) => setRadar({ ...radar, github: { ...radar.github, topics: list(event.target.value) } })} />
          </Field>
          <Field label="DEV Community tags" hint="Public API; no key required.">
            <TextInput value={radar.devCommunity.tags.join(", ")} onChange={(event) => setRadar({ ...radar, devCommunity: { tags: list(event.target.value) } })} />
          </Field>
          <Field label="Lobsters tags" hint="Public RSS; no key required.">
            <TextInput value={radar.lobsters.tags.join(", ")} onChange={(event) => setRadar({ ...radar, lobsters: { tags: list(event.target.value) } })} />
          </Field>
          <Field label="OpenAlex window (days)" hint="Recent academic work; no key required.">
            <TextInput mono type="number" min={1} max={3650} value={radar.openAlex.windowDays} onChange={(event) => setRadar({ ...radar, openAlex: { windowDays: Math.max(1, Math.min(3650, Number(event.target.value) || 1)) } })} />
          </Field>
        </div>
        <Field label="RSS and Atom URLs" hint="One URL per line.">
          <textarea className="type-data min-h-[96px] w-full rounded-control border border-rule-strong bg-surface px-3 py-2" value={radar.rss.urls.join("\n")} onChange={(event) => setRadar({ ...radar, rss: { urls: list(event.target.value) } })} />
        </Field>
      </CardSection>

      {pillars.length > 0 && (
        <CardSection label="Pillar keyword overrides" className="mt-4">
          <div className="grid gap-x-4 md:grid-cols-2">
            {pillars.filter((pillar) => pillar.enabled).map((pillar) => (
              <Field key={pillar.id} label={pillar.name} hint="Blank uses the pillar name and subtopics.">
                <TextInput value={(radar.keywordOverrides[pillar.id] ?? []).join(", ")} onChange={(event) => setRadar({
                  ...radar, keywordOverrides: { ...radar.keywordOverrides, [pillar.id]: list(event.target.value) },
                })} />
              </Field>
            ))}
          </div>
        </CardSection>
      )}

      <CardSection label="Selection" className="mt-4">
        <div className="grid gap-x-4 md:grid-cols-3">
          <Field label="Quality threshold"><TextInput mono type="number" min={0} max={100} value={radar.qualityThreshold} onChange={(event) => setRadar({ ...radar, qualityThreshold: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} /></Field>
          <Field label="Novelty floor"><TextInput mono type="number" min={0} max={100} value={radar.noveltyFloor} onChange={(event) => setRadar({ ...radar, noveltyFloor: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} /></Field>
          <Field label="Bank decay hours"><TextInput mono type="number" min={1} value={radar.bankDecayHours} onChange={(event) => setRadar({ ...radar, bankDecayHours: Math.max(1, Number(event.target.value) || 1) })} /></Field>
        </div>
      </CardSection>

      <CardSection label="Scoring weights" className="mt-4">
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          {RADAR_SCORE_KEYS.map((key) => (
            <Field key={key} label={key.replace(/([A-Z])/g, " $1").toLowerCase()}>
              <TextInput mono type="number" min={0} value={radar.weights[key]} onChange={(event) => setRadar({
                ...radar, weights: { ...radar.weights, [key]: Math.max(0, Number(event.target.value) || 0) },
              })} />
            </Field>
          ))}
        </div>
        <p className="type-small text-ink-3">Weights are normalized automatically; they do not need to sum to 100.</p>
      </CardSection>

      <div className="mt-4 flex items-center gap-3 border-t border-rule pt-4">
        <Button onClick={testProviders} disabled={testing}>{testing ? "Testing" : "Test all providers"}</Button>
        <MicroLabel>credentials optional</MicroLabel>
      </div>
    </Card>
  );
}

function providerId(key: keyof RadarSettings["providers"]): string {
  return ({ nativeModelSearch: "native-model-search", hackerNews: "feeds:hacker-news", reddit: "feeds:reddit", arxiv: "feeds:arxiv", github: "feeds:github", devCommunity: "feeds:dev-community", lobsters: "feeds:lobsters", openAlex: "feeds:openalex", rss: "feeds:rss" } as const)[key];
}

/* ------------------------------------------------------------------ model -- */

function ModelSection({ settings, update, overrides }: {
  settings: Settings;
  update: (c: Partial<Settings>) => void;
  overrides: SettingsFormProps["modelOverrides"];
}) {
  const toast = useToast();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionResult | null>(null);

  async function testConnection() {
    setTesting(true);
    setResult(null);
    // One key per attempt: a double click inside the same attempt replays the
    // first run instead of paying twice.
    const idempotencyKey = `connection-${Date.now()}`;
    try {
      const response = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey }),
      });
      const body = (await response.json()) as ConnectionResult;
      setResult(response.ok ? body : { ok: false, error: body.error ?? `Request failed (${response.status}).` });
      if (!response.ok) toast.show(body.error ?? "The test call failed.", "failure");
    } catch (err) {
      setResult({ ok: false, error: (err as Error).message });
      toast.show(`The test call failed: ${(err as Error).message}`, "failure");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card label="Model" padding="24">
      <Field label="Provider" hint={overrides.baseUrl ? `Anthropic protocol via ${overrides.baseUrl}` : "Anthropic Messages API."}>
        <TextInput value={settings.model.provider} readOnly disabled mono />
      </Field>

      <Field label="Strong model" hint={overrides.strong ? "Pinned by AI_MODEL_STRONG in .env." : "Research, angle generation, writing, and critique."}>
        <TextInput
          mono
          value={overrides.strong ?? settings.model.strong}
          disabled={Boolean(overrides.strong)}
          onChange={(e) => update({ model: { ...settings.model, strong: e.target.value } })}
        />
      </Field>

      <Field label="Fast model" hint={overrides.fast ? "Pinned by AI_MODEL_FAST in .env." : "Scoring, claim validation, classification, and similarity triage."}>
        <TextInput
          mono
          value={overrides.fast ?? settings.model.fast}
          disabled={Boolean(overrides.fast)}
          onChange={(e) => update({ model: { ...settings.model, fast: e.target.value } })}
        />
      </Field>

      <CardSection label="Connection">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={testConnection} disabled={testing}>
            {testing ? "Testing" : "Test connection"}
          </Button>
          <MicroLabel>one tiny call</MicroLabel>
        </div>

        {result && (
          <div className="mt-3">
            {result.ok ? (
              <dl data-mono className="type-data grid grid-cols-2 gap-x-4 gap-y-1 text-ink-2">
                <dt className="text-ink-3">reply</dt>
                <dd className="text-ink">{result.reply || "(empty)"}</dd>
                <dt className="text-ink-3">model</dt>
                <dd>{result.model}</dd>
                <dt className="text-ink-3">latency</dt>
                <dd>{formatMs(result.latencyMs ?? 0)}</dd>
                <dt className="text-ink-3">tokens</dt>
                <dd>
                  {result.tokensIn} in / {result.tokensOut} out
                </dd>
                <dt className="text-ink-3">cost</dt>
                <dd>
                  {formatCost(result.costEstimate ?? 0)}
                  {result.sandbox ? " (sandbox, not charged)" : ""}
                </dd>
                <dt className="text-ink-3">run</dt>
                <dd>
                  <a className="underline underline-offset-2 hover:text-ink" href={`/inspect#${result.runId}`}>
                    {result.runId}
                  </a>
                </dd>
              </dl>
            ) : (
              <p className="type-small text-unsupported">{result.error}</p>
            )}
          </div>
        )}
      </CardSection>
    </Card>
  );
}

/* ----------------------------------------------------------------- budget -- */

function BudgetSection({ settings, update }: { settings: Settings; update: (c: Partial<Settings>) => void }) {
  const { budget } = settings;
  return (
    <Card label="Budget" padding="24">
      <Field label="Daily token budget" hint="The meter fills to amber at 80%. At 100% expensive actions need an explicit override.">
        <TextInput
          mono
          type="number"
          min={1}
          value={budget.dailyTokenBudget}
          onChange={(e) => update({ budget: { ...budget, dailyTokenBudget: Number(e.target.value) || 1 } })}
        />
      </Field>
      <Field label="Max runs per day">
        <TextInput
          mono
          type="number"
          min={1}
          value={budget.maxRunsPerDay}
          onChange={(e) => update({ budget: { ...budget, maxRunsPerDay: Number(e.target.value) || 1 } })}
        />
      </Field>
      <Field label="Cooldown seconds" hint="Time between runs. This one is never overridable - it exists to stop double-fires.">
        <TextInput
          mono
          type="number"
          min={0}
          value={budget.cooldownSeconds}
          onChange={(e) => update({ budget: { ...budget, cooldownSeconds: Math.max(0, Number(e.target.value) || 0) } })}
        />
      </Field>
    </Card>
  );
}

/* ---------------------------------------------------------------- sandbox -- */

function SandboxSection({
  settings,
  update,
  fixtures,
  forcedByEnv,
}: {
  settings: Settings;
  update: (c: Partial<Settings>) => void;
  fixtures: number;
  forcedByEnv: boolean;
}) {
  return (
    <Card label="Sandbox" padding="24">
      <Toggle
        label="Serve every model call from fixtures"
        description={`${fixtures} fixture${fixtures === 1 ? "" : "s"} available. The full pipeline runs, the full interface renders, nothing is sent and nothing is charged.`}
        checked={forcedByEnv || settings.sandbox.enabled}
        disabled={forcedByEnv}
        disabledReason={forcedByEnv ? "SANDBOX_MODE=true in .env pins this on." : undefined}
        onChange={(enabled) => update({ sandbox: { enabled } })}
      />
    </Card>
  );
}

/* ------------------------------------------------------------- appearance -- */

function AppearanceSection({ settings, update }: { settings: Settings; update: (c: Partial<Settings>) => void }) {
  return (
    <Card label="Appearance" padding="24">
      <Field label="Theme">
        <RadioRow<Theme>
          name="Theme"
          value={settings.appearance.theme}
          onChange={(theme) => update({ appearance: { theme } })}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ]}
        />
      </Field>
    </Card>
  );
}

function MemorySection({ settings, update }: { settings: Settings; update: (c: Partial<Settings>) => void }) {
  return (
    <Card label="Memory patterns" padding="24">
      <Field label="Confidence floor" hint="Minimum relative difference before an observation appears. Patterns remain hidden until ten posts have metrics.">
        <TextInput mono type="number" min={0.05} max={1} step={0.05} value={settings.memory.patternConfidenceFloor} onChange={(event) => update({ memory: { patternConfidenceFloor: Math.max(0.05, Math.min(1, Number(event.target.value) || 0.2)) } })} />
      </Field>
    </Card>
  );
}

/* ---------------------------------------------------------------- persona -- */

function PersonaSection({ hasPersona }: { hasPersona: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [newPersonConfirm, setNewPersonConfirm] = useState("");
  const NEW_PERSON_PHRASE = "start new person";

  async function startNewPerson() {
    setBusy(true);
    try {
      const response = await fetch("/api/persona", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: newPersonConfirm }),
      });
      const body = await response.json();
      toast.show(body.message ?? body.error ?? "Done.", response.ok ? "default" : "failure");
      if (response.ok) {
        router.push("/brain#inbox");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadDemo() {
    setBusy(true);
    try {
      const response = await fetch("/api/persona/demo", { method: "POST" });
      toast.show(response.ok ? "Loaded the Nova demo persona." : "The demo persona could not be loaded.", response.ok ? "default" : "failure");
      if (response.ok) window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card label="Persona" padding="24">
      <CardSection>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="type-body text-ink-2">
            Create a new person or update the current one from a ChatGPT profile. You will review the Brain diff
            before saving.
          </p>
          <a
            href="/brain#inbox"
            className="type-body-strong inline-flex items-center rounded-control border border-rule-strong px-3 py-2 text-ink hover:bg-surface-sunken"
          >
            Create from ChatGPT profile
          </a>
        </div>
      </CardSection>

      <CardSection className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="type-body text-ink-2">
            Re-run onboarding. It edits the persona you already have and wipes nothing.
          </p>
          <a
            href="/onboarding"
            className="type-body-strong inline-flex items-center rounded-control border border-rule-strong px-3 py-2 text-ink hover:bg-surface-sunken"
          >
            Run onboarding
          </a>
        </div>
      </CardSection>

      <CardSection className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="type-body text-ink-2">
            Load the Nova demo persona, with twenty writing samples. It replaces the current persona.
          </p>
          <Button onClick={loadDemo} disabled={busy}>
            Load demo persona
          </Button>
        </div>
      </CardSection>

      {hasPersona && (
        <CardSection className="mt-3">
          <p className="type-body text-ink-2">
            Start over from a clean Brain. This deletes the current persona, samples, fingerprint, and
            persona versions. Settings, runs, topics, sources, and writing memory stay untouched.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <TextInput
              mono
              className="max-w-[240px]"
              placeholder={NEW_PERSON_PHRASE}
              aria-label={`Type ${NEW_PERSON_PHRASE} to confirm`}
              value={newPersonConfirm}
              onChange={(e) => setNewPersonConfirm(e.target.value)}
            />
            <Button
              variant="destructive"
              onClick={startNewPerson}
              disabled={busy || newPersonConfirm !== NEW_PERSON_PHRASE}
            >
              Start over
            </Button>
          </div>
          <p className="type-small mt-2 text-ink-3">
            Type <span data-mono className="type-data text-ink-2">{NEW_PERSON_PHRASE}</span> to enable the button.
          </p>
        </CardSection>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------- data -- */

function DataSection({ data, settings, gitSyncEnabled }: { data: DataInfo; settings: Settings; gitSyncEnabled: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);

  async function sync(action: "pull" | "push") {
    setBusy(action);
    setConflicts([]);
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json();
      setConflicts(body.conflicts ?? []);
      toast.show(body.message ?? body.error ?? "Done.", body.ok ? "default" : "failure");
    } catch (err) {
      toast.show(`Sync failed: ${(err as Error).message}`, "failure");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card label="Data" padding="24">
      <dl data-mono className="type-data grid grid-cols-[120px_1fr] gap-x-4 gap-y-1 text-ink-2">
        <dt className="text-ink-3">path</dt>
        <dd className="break-all">{data.path}</dd>
        <dt className="text-ink-3">size</dt>
        <dd>
          {formatBytes(data.bytes)} across {data.files} file{data.files === 1 ? "" : "s"}
        </dd>
        <dt className="text-ink-3">last pull</dt>
        <dd>{formatRelative(settings.sync.lastPullAt)}</dd>
        <dt className="text-ink-3">last push</dt>
        <dd>{formatRelative(settings.sync.lastPushAt)}</dd>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => sync("pull")} disabled={busy !== null || !gitSyncEnabled}>
          {busy === "pull" ? "Pulling" : "Pull"}
        </Button>
        <Button onClick={() => sync("push")} disabled={busy !== null || !gitSyncEnabled}>
          {busy === "push" ? "Pushing" : "Push"}
        </Button>
        <a
          href="/api/data/export"
          className="type-body-strong inline-flex items-center rounded-control border border-rule-strong px-3 py-2 text-ink hover:bg-surface-sunken"
        >
          Export all as zip
        </a>
      </div>

      {!gitSyncEnabled && (
        <p className="type-small mt-3 text-ink-3">
          Git data sync is off by default because this directory contains private identity, prompts, and writing history.
          Enable it only for a private checkout and private remote.
        </p>
      )}

      {conflicts.length > 0 && (
        <div className="mt-4">
          <MicroLabel strong className="mb-2 block">
            conflicting files
          </MicroLabel>
          <ul data-mono className="type-data space-y-1 text-unsupported">
            {conflicts.map((file) => (
              <li key={file}>{file}</li>
            ))}
          </ul>
          <p className="type-small mt-2 text-ink-2">Resolve these in git, then pull again.</p>
        </div>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------- danger zone -- */

function DangerZone() {
  const toast = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [memoryConfirmText, setMemoryConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const CONFIRM_PHRASE = "delete all data";
  const MEMORY_CONFIRM_PHRASE = "reset writing memory";

  async function post(url: string, body: unknown, successFallback: string) {
    setBusy(true);
    try {
      const response = await fetch(url, {
        method: url === "/api/settings" ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      toast.show(data.message ?? data.error ?? successFallback, response.ok ? "default" : "failure");
      if (response.ok) window.location.reload();
    } catch (err) {
      toast.show((err as Error).message, "failure");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card label="Danger zone" padding="24">
      <CardSection>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="type-body text-ink-2">Reset every setting to its default.</p>
          <Button variant="destructive" disabled={busy} onClick={() => post("/api/settings", null, "Settings reset.")}>
            Reset settings
          </Button>
        </div>
      </CardSection>

      <CardSection className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="type-body text-ink-2">
            Clear the cache index. Always safe - it is derived and rebuilds from the source files.
          </p>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => post("/api/data", { action: "clear-cache" }, "Cache cleared.")}
          >
            Clear cache index
          </Button>
        </div>
      </CardSection>

      <CardSection className="mt-3">
        <p className="type-body text-ink-2">
          Reset what the writer remembers publishing and learning from. This deletes the content archive, feedback,
          metrics, saved exports, evolution suggestions, and Today history. Your Brain, experience, writing samples,
          sources, topics, settings, and run audit stay intact.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <TextInput
            mono
            className="max-w-[240px]"
            placeholder={MEMORY_CONFIRM_PHRASE}
            aria-label={`Type ${MEMORY_CONFIRM_PHRASE} to confirm`}
            value={memoryConfirmText}
            onChange={(e) => setMemoryConfirmText(e.target.value)}
          />
          <Button
            variant="destructive"
            disabled={busy || memoryConfirmText !== MEMORY_CONFIRM_PHRASE}
            onClick={() =>
              post(
                "/api/data",
                { action: "reset-memory", confirm: memoryConfirmText },
                "Writing memory reset.",
              )
            }
          >
            Reset writing memory
          </Button>
        </div>
        <p className="type-small mt-2 text-ink-3">
          Type <span data-mono className="type-data text-ink-2">{MEMORY_CONFIRM_PHRASE}</span> to enable the button.
        </p>
      </CardSection>

      <CardSection className="mt-3">
        <p className="type-body text-ink-2">
          Delete every file under /data. Your git history still has them; your working tree will not.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <TextInput
            mono
            className="max-w-[240px]"
            placeholder={CONFIRM_PHRASE}
            aria-label={`Type ${CONFIRM_PHRASE} to confirm`}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
          <Button
            variant="destructive"
            disabled={busy || confirmText !== CONFIRM_PHRASE}
            onClick={() => post("/api/data", { action: "delete-all", confirm: confirmText }, "Data deleted.")}
          >
            Delete all data
          </Button>
        </div>
        <p className="type-small mt-2 text-ink-3">
          Type <span data-mono className="type-data text-ink-2">{CONFIRM_PHRASE}</span> to enable the button.
        </p>
      </CardSection>
    </Card>
  );
}
