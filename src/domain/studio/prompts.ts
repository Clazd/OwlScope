import {
  getExperiencePromptBlock,
  getFingerprintPromptBlock,
  getPersonaPromptBlock,
  type Deviation,
} from "@/domain/persona/fingerprint";
import type { ExperienceItem, Fingerprint, Persona } from "@/domain/persona/schema";
import type { ResearchRecord, Source } from "./schema";

/**
 * Prompt modules, assembled per task. Never one concatenated blob.
 *
 * The modules are separate functions rather than one template because the
 * stages genuinely need different subsets: the researcher gets no voice
 * fingerprint, the critic gets no experience log unless the draft claims
 * experience, and the writer gets no memory it does not need. A single blob
 * would send all of it every time and cost money to do the wrong thing.
 */

/**
 * The truthfulness core, verbatim in every factual task.
 *
 * It is a single exported constant so that "identical in every factual task" is
 * a fact about the code rather than a promise in a document.
 */
export const TRUTHFULNESS_CORE = [
  "Do not invent facts, statistics, quotations, sources, or URLs.",
  "Do not claim personal experience unless it appears in the experience log provided.",
  "Treat the retrieved evidence as the factual boundary.",
  "Label inference as inference.",
  "If the evidence is inadequate, say so.",
  "Opinions may be stated as opinions.",
].join(" ");

export function truthfulnessBlock(): string {
  return `TRUTHFULNESS\n${TRUTHFULNESS_CORE}`;
}

/* --------------------------------------------------------------- persona -- */

export function personaBlock(persona: Persona): string {
  return getPersonaPromptBlock(persona);
}

export function fingerprintBlock(fingerprint: Fingerprint | null): string {
  return getFingerprintPromptBlock(fingerprint);
}

/**
 * The experience log, included only when the task could invite a first-hand
 * claim. Sending it to a stage that cannot make one is wasted budget; not
 * sending it to a stage that can is a fabricated anecdote.
 */
export function experienceBlock(items: ExperienceItem[]): string {
  return getExperiencePromptBlock(items);
}

/* ----------------------------------------------------------------- topic -- */

export function topicBlock(topic: { title: string; summary: string; context: string; freshness: string }): string {
  return [
    "TOPIC",
    topic.title,
    topic.summary ? `Summary: ${topic.summary}` : "",
    topic.context ? `What the user already knows: ${topic.context}` : "",
    `Freshness: ${topic.freshness}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* -------------------------------------------------------------- evidence -- */

/**
 * Sources, rendered with their ids so downstream stages can cite them.
 *
 * Every claim the writer makes has to name a `src_` id from this block, which is
 * only checkable because the ids are here and nowhere else.
 */
export function sourcesBlock(sources: Source[]): string {
  if (sources.length === 0) {
    return "SOURCES\nNone retrieved. You have no evidence. Do not write as if you had any.";
  }
  return [
    "SOURCES - the complete evidence. Cite by id. Nothing outside this list exists.",
    ...sources.map((source) =>
      [
        `[${source.id}] ${source.title}`,
        `  ${source.url} (${source.domain}, ${source.sourceQuality}${
          source.publishedAt ? `, published ${source.publishedAt}` : ", no publication date"
        })`,
        source.excerpt ? `  "${source.excerpt}"` : "  (no text retrieved)",
      ].join("\n"),
    ),
  ].join("\n");
}

export function researchBlock(research: ResearchRecord): string {
  const lines = ["VALIDATED RESEARCH"];
  if (research.facts.length > 0) {
    lines.push("Established:");
    for (const fact of research.facts) {
      const cite = fact.sourceIds.length > 0 ? ` [${fact.sourceIds.join(", ")}]` : " [no source - inference]";
      lines.push(`  ${fact.kind === "inference" ? "(inference) " : ""}${fact.claim}${cite}`);
    }
  }
  if (research.uncertainties.length > 0) {
    lines.push("Not established - treat as open questions, never as fact:");
    for (const item of research.uncertainties) lines.push(`  ${item}`);
  }
  lines.push(`Freshness: ${research.freshness.assessment}. ${research.freshness.note}`);
  if (research.insufficient) {
    lines.push(`EVIDENCE IS INSUFFICIENT: ${research.insufficientReason}`);
  }
  return lines.join("\n");
}

/* ---------------------------------------------------------------- memory -- */

/**
 * Retrieved memory: the most relevant prior posts, never the whole history.
 *
 * The cap is the point. A history of a thousand posts sent every run is how a
 * cheap product becomes an expensive one, and the model does not read the
 * thousandth one anyway.
 */
export const MEMORY_LIMIT = 30;

export function memoryBlock(posts: Array<{ text: string; createdAt: string }>): string {
  if (posts.length === 0) {
    return "RECENT POSTS\nNothing published yet. There is nothing to repeat.";
  }
  return [
    `RECENT POSTS - the ${posts.length} most relevant. Do not repeat these, in wording or in argument.`,
    ...posts.slice(0, MEMORY_LIMIT).map((post) => `  (${post.createdAt.slice(0, 10)}) ${post.text}`),
  ].join("\n");
}

/* ------------------------------------------------------------ deviations -- */

/**
 * The mechanical fingerprint deviations, handed to the critic.
 *
 * This is why the critic names a broken rule instead of giving an impression:
 * it is told which rules broke, measured in code, and asked to judge only the
 * things that need judgement.
 */
export function deviationsBlock(score: number, deviations: Deviation[]): string {
  if (deviations.length === 0) {
    return `MEASURED VOICE DEVIATIONS\nFingerprint score ${score}/100. Nothing mechanical is out of character.`;
  }
  return [
    `MEASURED VOICE DEVIATIONS - computed in code, not judgement. Fingerprint score ${score}/100.`,
    ...deviations.map((d) => `  [${d.severity}] ${d.rule}: ${d.message}`),
    "Refer to these specifically. Do not restate them as vague impressions.",
  ].join("\n");
}

/* ---------------------------------------------------------- output schema -- */

export function outputBlock(schemaName: string, shape: string): string {
  return [`OUTPUT - a single JSON value matching ${schemaName}.`, shape, "No prose. No code fence."].join("\n");
}
