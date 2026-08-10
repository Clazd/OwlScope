"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { TextInput } from "@/components/common/Field";
import { MicroLabel } from "@/components/common/MicroLabel";
import { useToast } from "@/components/common/Toast";
import type { PersonaSuggestion } from "@/domain/evolution/schema";

export function EvolutionPanel({ initial, eventCount }: { initial: PersonaSuggestion[]; eventCount: number }) {
  const toast = useToast();
  const [suggestions, setSuggestions] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = suggestions.filter((item) => item.status === "pending");

  async function request(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch("/api/persona/evolution", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Evolution could not run.");
      if (result.suggestion) setSuggestions((current) => [...current.filter((item) => item.id !== result.suggestion.id), result.suggestion]);
      if (result.reason) setMessage(result.reason);
      if (body.action === "accept") toast.show("Suggestion accepted as a new persona version.");
      return result;
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Evolution could not run.", "failure");
      return null;
    } finally { setBusy(false); }
  }

  return (
    <div className="px-6 pb-8">
      <Card label="Evolution suggestions" padding="24">
        <p className="type-small reading-column text-ink-3">On demand only. Feedback may propose a specific numeric preference; beliefs, boundaries, voice rules, and the fingerprint are never changed here.</p>
        <div className="mt-4 space-y-4">
          {pending.map((suggestion) => <Suggestion key={suggestion.id} suggestion={suggestion} busy={busy} onAction={request} />)}
          {pending.length === 0 && <p className="type-body text-ink-2">No pending suggestion. Analysis requires at least 15 feedback events; {eventCount} are currently stored.</p>}
        </div>
        {message && <p data-mono className="type-data mt-3 text-ink-3">{message}</p>}
        <Button className="mt-4" disabled={busy} onClick={() => void request({ action: "analyse" })}>{busy ? "Analysing" : "Analyse feedback"}</Button>
      </Card>
    </div>
  );
}

function Suggestion({ suggestion, busy, onAction }: { suggestion: PersonaSuggestion; busy: boolean; onAction: (body: Record<string, unknown>) => Promise<unknown> }) {
  const [value, setValue] = useState(String(suggestion.proposedValue));
  return <article className="border-t border-rule pt-4 first:border-t-0 first:pt-0"><MicroLabel>{suggestion.target} · {suggestion.declines}/3 declines</MicroLabel><p className="type-body mt-2 text-ink-2">{suggestion.evidence}</p><div className="mt-3 flex flex-wrap items-center gap-2"><TextInput mono type="number" min={0} max={100} value={value} onChange={(event) => setValue(event.target.value)} className="w-[144px]" aria-label="Modified suggested value" /><Button variant="primary" disabled={busy} onClick={() => void onAction({ action: "accept", id: suggestion.id, value: Math.max(0, Math.min(100, Number(value) || 0)) })}>Accept as new version</Button><Button variant="quiet" disabled={busy} onClick={() => void onAction({ action: "reject", id: suggestion.id })}>Reject</Button><Button variant="quiet" disabled={busy} onClick={() => void onAction({ action: "suppress", id: suggestion.id })}>Never suggest again</Button></div></article>;
}
