import type { Feedback } from "@/domain/feedback/schema";

export interface FeedbackWindowSummary {
  rejectionLabels: Record<string, number>;
  unlabelledRejections: number;
  radarDismissals: number;
}

export interface FeedbackSummary {
  last30: FeedbackWindowSummary;
  last90: FeedbackWindowSummary;
}

export function summariseFeedback(feedback: readonly Feedback[], now = new Date()): FeedbackSummary {
  return {
    last30: summariseWindow(feedback, now, 30),
    last90: summariseWindow(feedback, now, 90),
  };
}

function summariseWindow(feedback: readonly Feedback[], now: Date, days: number): FeedbackWindowSummary {
  const since = now.getTime() - days * 86_400_000;
  const result: FeedbackWindowSummary = { rejectionLabels: {}, unlabelledRejections: 0, radarDismissals: 0 };
  for (const item of feedback) {
    const created = new Date(item.createdAt).getTime();
    if (!Number.isFinite(created) || created < since || created > now.getTime()) continue;
    if (item.kind === "radar-dismissal") {
      result.radarDismissals += 1;
      continue;
    }
    if (item.undoneAt) continue;
    if (item.reasons.length === 0) result.unlabelledRejections += 1;
    for (const reason of item.reasons) result.rejectionLabels[reason] = (result.rejectionLabels[reason] ?? 0) + 1;
  }
  return result;
}
