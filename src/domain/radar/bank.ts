import type { Topic } from "@/domain/studio/schema";

export function bankTopic(topic: Topic, decayHours: number, now = new Date()): Topic {
  const bankedAt = now.toISOString();
  const bankedUntil = topic.freshness === "evergreen" ? null : new Date(now.getTime() + decayHours * 3600000).toISOString();
  return { ...topic, sourceType: "bank", status: "banked", bankedAt, bankedUntil, updatedAt: bankedAt };
}

export function expireBankedTopic(topic: Topic, now = new Date()): Topic {
  if (topic.status !== "banked" || !topic.bankedUntil) return topic;
  if (new Date(topic.bankedUntil).getTime() > now.getTime()) return topic;
  return { ...topic, status: "stale", updatedAt: now.toISOString() };
}

export function shouldMergeBanked(topic: Topic, title: string, urls: readonly string[], normalise: (title: string) => string): boolean {
  if (topic.status !== "banked") return false;
  if (normalise(topic.title) === normalise(title)) return true;
  return urls.some((url) => topic.context.includes(url));
}
