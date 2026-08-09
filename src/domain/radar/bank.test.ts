import { describe, expect, it } from "vitest";
import type { Topic } from "@/domain/studio/schema";
import { bankTopic, expireBankedTopic } from "./bank";

function topic(freshness: Topic["freshness"]): Topic {
  return {
    id: "topic", title: "A topic", summary: "", sourceType: "radar", pillarId: null,
    freshness, status: "ready", context: "", scoreComponents: null, createdAt: "2026-08-09T00:00:00.000Z",
  };
}

describe("Radar idea bank", () => {
  it("expires fresh topics after the configured window", () => {
    const banked = bankTopic(topic("current"), 72, new Date("2026-08-01T00:00:00.000Z"));
    expect(banked.bankedUntil).toBe("2026-08-04T00:00:00.000Z");
    expect(expireBankedTopic(banked, new Date("2026-08-04T00:00:00.001Z")).status).toBe("stale");
  });

  it("never assigns an expiry to evergreen topics", () => {
    const banked = bankTopic(topic("evergreen"), 72, new Date("2026-08-01T00:00:00.000Z"));
    expect(banked.bankedUntil).toBeNull();
    expect(expireBankedTopic(banked, new Date("2036-08-01T00:00:00.000Z")).status).toBe("banked");
  });
});
