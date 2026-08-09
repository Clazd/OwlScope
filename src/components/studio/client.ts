"use client";

import type { ContentItem, GateReport, Source, StudioSession, Topic } from "@/domain/studio/schema";

/**
 * The browser half of the Studio.
 *
 * Every expensive action carries an idempotency key, so a double click or a
 * refresh mid-run resolves to the run that already exists instead of paying for
 * a second one. The key is generated here because here is where the double
 * click happens.
 */

export interface StudioResponse {
  session?: StudioSession;
  sources?: Source[];
  topic?: Topic;
  content?: ContentItem;
  gates?: GateReport;
  finalised?: boolean;
  blocked?: boolean;
  runId?: string;
  replayed?: boolean;
  error?: string;
  errorCategory?: string;
  detail?: string | null;
  stage?: string;
}

export class StudioError extends Error {
  readonly status: number;
  readonly gates?: GateReport;
  readonly category?: string;

  constructor(message: string, status: number, extra: { gates?: GateReport; category?: string } = {}) {
    super(message);
    this.name = "StudioError";
    this.status = status;
    this.gates = extra.gates;
    this.category = extra.category;
  }
}

export function newKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function post(path: string, body: Record<string, unknown>): Promise<StudioResponse> {
  const response = await fetch(`/api/studio/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as StudioResponse;
  if (!response.ok) {
    throw new StudioError(payload.error ?? `The ${path} step failed.`, response.status, {
      gates: payload.gates,
      category: payload.errorCategory,
    });
  }
  return payload;
}

export async function loadSession(id: string): Promise<StudioResponse> {
  const response = await fetch(`/api/studio/session?id=${encodeURIComponent(id)}`);
  const payload = (await response.json().catch(() => ({}))) as StudioResponse;
  if (!response.ok) throw new StudioError(payload.error ?? "Could not load that session.", response.status);
  return payload;
}

/** `6h`, `2d`. The margin has 200px; a full timestamp does not fit and does not help. */
export function shortAge(iso: string | null): string {
  if (!iso) return "undated";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "undated";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}
