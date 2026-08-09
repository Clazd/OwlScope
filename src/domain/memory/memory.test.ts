import { describe, expect, it } from "vitest";
import type { Feedback } from "@/domain/feedback/schema";
import { summariseFeedback } from "./feedback";
import { filterMemoryEntries } from "./search";
import type { MemoryContentEntry, MemoryEntry } from "./schema";

describe("Memory search and feedback", () => {
  it("searches topic, thesis, and text and combines every filter", () => {
    const entries: MemoryEntry[] = [entry("one", { topic: "Agent memory", thesis: "State survives context", text: "Durable files beat larger windows.", pillarId: "ai", angle: "technical", status: "published", feedbackLabels: ["too generic"] }), entry("two", { topic: "Rust", pillarId: "code", angle: "explanation", status: "rejected" })];
    expect(filterMemoryEntries(entries, { query: "larger windows", pillar: "ai", status: "published", angle: "technical", feedback: "too generic", from: "2026-08-01", to: "2026-08-31" }).map((item) => item.id)).toEqual(["one"]);
  });

  it("filters one thousand cached entries without I/O", () => {
    const entries = Array.from({ length: 1_000 }, (_, index) => entry(`item-${index}`, { text: index === 777 ? "needle mechanism" : `post ${index}` }));
    const started = performance.now();
    const result = filterMemoryEntries(entries, { query: "needle" });
    expect(result.map((item) => item.id)).toEqual(["item-777"]);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it("keeps Radar dismissals separate and counts unlabelled rejection events", () => {
    const feedback: Feedback[] = [
      { id: "r", kind: "radar-dismissal", topicId: "t", title: "x", scoreComponents: null, createdAt: "2026-08-08T00:00:00.000Z" },
      { id: "c", kind: "today-rejection", contentId: "c", topicId: "t", reasons: [], note: "", createdAt: "2026-08-07T00:00:00.000Z", undoneAt: null },
      { id: "c2", kind: "today-rejection", contentId: "c2", topicId: "t", reasons: ["too generic"], note: "", createdAt: "2026-08-06T00:00:00.000Z", undoneAt: null },
    ];
    const summary = summariseFeedback(feedback, new Date("2026-08-09T00:00:00.000Z"));
    expect(summary.last30.radarDismissals).toBe(1);
    expect(summary.last30.unlabelledRejections).toBe(1);
    expect(summary.last30.rejectionLabels["too generic"]).toBe(1);
  });
});

function entry(id: string, overrides: Partial<MemoryContentEntry> = {}): MemoryContentEntry {
  return { id, kind: "content", date: "2026-08-09", createdAt: "2026-08-09T00:00:00.000Z", publishedAt: "2026-08-09T00:00:00.000Z", publicUrl: null, status: "accepted", topicId: `topic-${id}`, topic: "Topic", pillarId: "ai", pillar: "AI", freshness: "evergreen", angle: "opinion", thesis: "Thesis", text: "Text", characterCount: 4, personaVersion: 1, runId: `run-${id}`, reasoning: "", sentences: [], sources: [], feedbackLabels: [], feedbackNote: "", ...overrides };
}
