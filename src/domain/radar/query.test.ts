import { describe, expect, it } from "vitest";
import { emptyPersona } from "@/domain/persona/defaults";
import { keywordsFor, queryFor } from "./query";

describe("Radar query planning", () => {
  it("covers every enabled pillar before consuming later subtopics", () => {
    const persona = emptyPersona();
    persona.pillars = [
      { id: "a", name: "AI", description: "", weight: 50, enabled: true, freshnessPreference: "fresh", subtopics: ["agents", "models", "evals"] },
      { id: "b", name: "Products", description: "", weight: 50, enabled: true, freshnessPreference: "balanced", subtopics: ["onboarding", "retention"] },
    ];
    expect(keywordsFor(persona, {})).toEqual(["AI", "Products", "agents", "onboarding", "models", "retention", "evals"]);
  });

  it("uses a pillar override and retains the fallback identity query", () => {
    const persona = emptyPersona();
    persona.identityStatement = "student builder";
    persona.pillars = [{ id: "a", name: "AI", description: "", weight: 100, enabled: true, freshnessPreference: "fresh", subtopics: ["agents"] }];
    expect(keywordsFor(persona, { a: ["tool calling", "LLM evals"] })).toEqual(["tool calling", "LLM evals"]);
    persona.pillars[0]!.enabled = false;
    expect(queryFor(persona, keywordsFor(persona, {}))).toBe("student builder");
  });
});
