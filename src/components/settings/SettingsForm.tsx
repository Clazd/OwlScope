"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/common/Button";
import { Card, CardSection } from "@/components/common/Card";
import { Field, RadioRow, TextInput, Toggle } from "@/components/common/Field";
import { MicroLabel } from "@/components/common/MicroLabel";
import { useToast } from "@/components/common/Toast";
import { formatBytes, formatMs, formatRelative } from "@/lib/format/display";
import { formatCost } from "@/services/ai/pricing";
import type { Settings, Theme } from "@/domain/settings/schema";

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
}

export function SettingsForm({ initial, data, sandboxForcedByEnv }: SettingsFormProps) {
  const toast = useToast();
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
      toast.show("Settings saved.");
    } catch (err) {
      toast.show(`Settings could not be saved: ${(err as Error).message}`, "failure");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ModelSection settings={settings} update={update} />
      <BudgetSection settings={settings} update={update} />
      <SandboxSection
        settings={settings}
        update={update}
        fixtures={data.fixtures}
        forcedByEnv={sandboxForcedByEnv}
      />
      <AppearanceSection settings={settings} update={update} />
      <DataSection data={data} settings={settings} />
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

/* ------------------------------------------------------------------ model -- */

function ModelSection({ settings, update }: { settings: Settings; update: (c: Partial<Settings>) => void }) {
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
      <Field label="Provider" hint="One adapter ships in this build. A second one is an afternoon's work, not a shipping requirement.">
        <TextInput value={settings.model.provider} readOnly disabled mono />
      </Field>

      <Field label="Strong model" hint="Angle generation, writing, critique, fact validation.">
        <TextInput
          mono
          value={settings.model.strong}
          onChange={(e) => update({ model: { ...settings.model, strong: e.target.value } })}
        />
      </Field>

      <Field label="Fast model" hint="Scoring, classification, similarity triage.">
        <TextInput
          mono
          value={settings.model.fast}
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
      <Field label="Cooldown seconds" hint="Time between runs. This one is never overridable — it exists to stop double-fires.">
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

/* ------------------------------------------------------------------- data -- */

function DataSection({ data, settings }: { data: DataInfo; settings: Settings }) {
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
        <Button onClick={() => sync("pull")} disabled={busy !== null}>
          {busy === "pull" ? "Pulling" : "Pull"}
        </Button>
        <Button onClick={() => sync("push")} disabled={busy !== null}>
          {busy === "push" ? "Pushing" : "Push"}
        </Button>
        <a
          href="/api/data/export"
          className="type-body-strong inline-flex items-center rounded-control border border-rule-strong px-3 py-2 text-ink hover:bg-surface-sunken"
        >
          Export all as zip
        </a>
      </div>

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
  const [busy, setBusy] = useState(false);
  const CONFIRM_PHRASE = "delete all data";

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
            Clear the cache index. Always safe — it is derived and rebuilds from the source files.
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
