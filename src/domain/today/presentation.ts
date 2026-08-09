import type { TodayRecord } from "./schema";

export function skipCardCopy(record: Pick<TodayRecord, "skipReason" | "consideredCount" | "rejectedSimilar" | "rejectedWeak">) {
  return {
    heading: "I would skip today.",
    explanation: record.skipReason || `I looked at ${record.consideredCount} things. ${record.rejectedSimilar} were too close to memory; ${record.rejectedWeak} did not clear the quality threshold.`,
  };
}
