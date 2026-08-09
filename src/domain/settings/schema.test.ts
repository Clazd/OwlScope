import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SettingsSchema } from "./schema";

describe("settings schema compatibility", () => {
  it("adds newly shipped keyless Radar providers to older saved settings", () => {
    const legacyProviders = Object.fromEntries(
      Object.entries(DEFAULT_SETTINGS.radar.providers).filter(([key]) => !["devCommunity", "lobsters", "openAlex"].includes(key)),
    );
    const legacyRadar = Object.fromEntries(
      Object.entries(DEFAULT_SETTINGS.radar).filter(([key]) => !["devCommunity", "lobsters", "openAlex"].includes(key)),
    );
    const parsed = SettingsSchema.parse({
      ...DEFAULT_SETTINGS,
      radar: { ...legacyRadar, providers: legacyProviders },
    });
    expect(parsed.radar.providers.devCommunity.enabled).toBe(true);
    expect(parsed.radar.providers.lobsters.enabled).toBe(true);
    expect(parsed.radar.providers.openAlex.enabled).toBe(true);
    expect(parsed.radar.openAlex.windowDays).toBe(90);
  });
});
