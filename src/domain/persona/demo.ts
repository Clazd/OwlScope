import "server-only";
import { newId } from "@/lib/ids";
import { DEFAULT_SLIDERS, DEFAULT_SWITCHES, seedVoiceRules, stockBoundaries } from "./defaults";
import { DEMO_SAMPLES_ADMIRED, DEMO_SAMPLES_MINE } from "./demo-samples";
import type { ExperienceItem, Persona, PersonaSnapshot, Sample } from "./schema";
import { normaliseWeights } from "./weights";

/**
 * Nova — the optional demo persona.
 *
 * Loadable and fully deletable, and referenced nowhere in application
 * behaviour: nothing branches on whether the persona is Nova. It exists so a
 * new user can see the product working before investing in configuration.
 */
export function buildDemoSnapshot(now: string = new Date().toISOString()): PersonaSnapshot {
  const pillarIds = {
    ai: newId(),
    programming: newId(),
    technology: newId(),
    startups: newId(),
    unusual: newId(),
  };

  const persona: Persona = {
    id: "persona",
    schemaVersion: 1,
    name: "Nova",
    description: "Writes about AI, software and the odd corners of both.",
    primaryLanguage: "en",
    secondaryLanguage: null,
    audience: "Engineers and product people who build things and are tired of hype.",
    focus: null,
    identityStatement:
      "I am someone deeply interested in AI, software, unusual products, and how technology changes the way people build things.",
    activeVersion: 0,
    onboardingComplete: true,
    pillars: normaliseWeights([
      {
        id: pillarIds.ai,
        name: "Artificial intelligence",
        description: "Models, tooling, and what actually ships.",
        weight: 35,
        enabled: true,
        freshnessPreference: "fresh",
        subtopics: ["open weights", "evaluation", "agents", "inference cost"],
      },
      {
        id: pillarIds.programming,
        name: "Programming",
        description: "Craft, trade-offs, and the cost of abstraction.",
        weight: 25,
        enabled: true,
        freshnessPreference: "evergreen",
        subtopics: ["code review", "testing", "refactoring"],
      },
      {
        id: pillarIds.technology,
        name: "Technology",
        description: "How tools change the way people work.",
        weight: 20,
        enabled: true,
        freshnessPreference: "balanced",
        subtopics: ["local-first", "developer tools", "protocols"],
      },
      {
        id: pillarIds.startups,
        name: "Startups and products",
        description: "Product decisions, not funding rounds.",
        weight: 10,
        enabled: true,
        freshnessPreference: "balanced",
        subtopics: ["pricing", "positioning", "scope"],
      },
      {
        id: pillarIds.unusual,
        name: "Unusual software experiments",
        description: "Things built because they were interesting.",
        weight: 10,
        enabled: true,
        freshnessPreference: "evergreen",
        subtopics: ["toy languages", "demoscene", "one-file tools"],
      },
    ]),
    beliefs: [
      {
        id: newId(),
        statement: "Good UX often matters more than adding more features.",
        strength: "strong",
        pillarId: pillarIds.startups,
        enabled: true,
      },
      {
        id: newId(),
        statement: "AI products should solve concrete problems.",
        strength: "strong",
        pillarId: pillarIds.ai,
        enabled: true,
      },
      {
        id: newId(),
        statement: "Open-source AI is worth watching.",
        strength: "moderate",
        pillarId: pillarIds.ai,
        enabled: true,
      },
      {
        id: newId(),
        statement: "Unusual software experiments are often more interesting than polished clones.",
        strength: "moderate",
        pillarId: pillarIds.unusual,
        enabled: true,
      },
    ],
    boundaries: stockBoundaries(["politics", "religion", "celebrity-gossip"]),
    voiceRules: seedVoiceRules(),
    sliders: {
      ...DEFAULT_SLIDERS,
      casualFormal: 25,
      conciseDetailed: 25,
      seriousHumorous: 40,
      neutralOpinionated: 62,
      technicalAccessible: 45,
      reservedEnergetic: 40,
    },
    switches: { ...DEFAULT_SWITCHES, emojis: false, hashtags: false, strongHooks: false },
    createdAt: now,
    updatedAt: now,
  };

  const samples: Sample[] = [
    ...DEMO_SAMPLES_MINE.map<Sample>((text) => ({ id: newId(), text, mode: "mine", createdAt: now })),
    ...DEMO_SAMPLES_ADMIRED.map<Sample>((text) => ({ id: newId(), text, mode: "admired", createdAt: now })),
  ];

  const experience: ExperienceItem[] = [
    { id: newId(), item: "Built a local-first note tool", detail: "Plain text files, no sync service.", occurredAt: "2025" },
    { id: newId(), item: "Ran a migration off a managed queue", detail: "Wrote the rollback first and never needed it.", occurredAt: "March 2026" },
  ];

  // Deliberately no fingerprint: loading the demo leaves the analysis to be run,
  // so the fingerprint path gets exercised rather than skipped.
  return { persona, fingerprint: null, samples, experience };
}
