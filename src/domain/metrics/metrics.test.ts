import { describe, expect, it } from "vitest";
import type { MemoryContentEntry } from "@/domain/memory/schema";
import type { ContentItem } from "@/domain/studio/schema";
import { dueAutopsy } from "./autopsy";
import { buildPatternReport } from "./patterns";
import type { Metric } from "./schema";

describe("metrics thresholds and observations", () => {
  it("does not expose Patterns below ten measured posts", () => {
    expect(buildPatternReport(entries(9), metrics(9), 0.2)).toBeNull();
  });

  it("states sample size and phrases a finding as an observation", () => {
    const report = buildPatternReport(entries(10), metrics(10), 0.2);
    expect(report?.metricCount).toBe(10);
    expect(report?.findings.every((finding) => finding.sampleSize === 10)).toBe(true);
    expect(report?.findings.some((finding) => finding.observation.startsWith("Your "))).toBe(true);
    expect(report?.findings.some((finding) => /post more|you should/i.test(finding.observation))).toBe(false);
  });

  it("asks once after seven days and never asks for a post with a metric record", () => {
    const post = content("old", "2026-08-01T00:00:00.000Z");
    expect(dueAutopsy([post], [], new Date("2026-08-09T00:00:00.000Z"))?.id).toBe("old");
    expect(dueAutopsy([post], [metric("old", 100)], new Date("2026-08-09T00:00:00.000Z"))).toBeNull();
  });
});

function entries(count: number): MemoryContentEntry[] { return Array.from({ length: count }, (_, index) => ({ id: `c${index}`, kind: "content", date: "2026-08-01", createdAt: `2026-08-01T${String(index).padStart(2, "0")}:00:00.000Z`, publishedAt: `2026-08-01T${String(index).padStart(2, "0")}:00:00.000Z`, publicUrl: null, status: "published", topicId: `t${index}`, topic: "Topic", pillarId: index < count / 2 ? "a" : "b", pillar: index < count / 2 ? "AI" : "Programming", freshness: index % 2 ? "current" : "evergreen", angle: index < count / 2 ? "opinion" : "explanation", thesis: "Thesis", text: "Post", characterCount: index < count / 2 ? 120 : 250, personaVersion: 1, runId: `r${index}`, reasoning: "", sentences: [], sources: [], feedbackLabels: [], feedbackNote: "" })); }
function metric(contentId: string, impressions: number): Metric { return { id: contentId, contentId, impressions, likes: null, replies: null, reposts: null, bookmarks: null, profileVisits: null, followersGained: null, promptedAt: "2026-08-08T00:00:00.000Z", recordedAt: "2026-08-08T00:00:00.000Z", skippedAt: null }; }
function metrics(count: number): Metric[] { return Array.from({ length: count }, (_, index) => metric(`c${index}`, index < count / 2 ? 1000 : 100)); }
function content(id: string, publishedAt: string): ContentItem { return { id, topicId: "t", personaVersion: 1, status: "published", angle: "opinion", thesis: "", text: "", sentences: [], characterCount: 0, fingerprintScore: 0, sourceIds: [], critique: null, validation: null, similarity: null, reasoning: "", override: null, rejectionReasons: [], provider: "", model: "", runId: "r", createdAt: publishedAt, updatedAt: publishedAt, publishedAt, publicUrl: null }; }
