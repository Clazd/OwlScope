import { createLogger } from "@/lib/logging/log";

const log = createLogger("studio/context");

/**
 * The context assembler: an explicit token budget per prompt section, and a log
 * of what each stage actually spent.
 *
 * Without this, prompt sections grow until something silently falls out of the
 * window and the failure looks like a model getting worse. With it, an
 * over-budget section is trimmed at a boundary we chose and reported in the
 * Inspector.
 */

export type ContextSection = "persona" | "memory" | "evidence" | "instructions" | "output";

/** Starting values. Tuned by watching the usage log, not by guessing twice. */
export const CONTEXT_BUDGET: Record<ContextSection, number> = {
  persona: 800,
  memory: 1500,
  evidence: 2500,
  instructions: 1200,
  output: 800,
};

/**
 * Four characters per token.
 *
 * Deliberately an estimate: the real count needs a tokeniser, a tokeniser is a
 * dependency and a network call, and the budget only has to stop a section
 * running away. The Inspector shows the provider's real counts afterwards.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface SectionUsage {
  section: ContextSection;
  tokens: number;
  budget: number;
  truncated: boolean;
}

export interface AssembledContext {
  prompt: string;
  usage: SectionUsage[];
  totalTokens: number;
}

interface Part {
  section: ContextSection;
  text: string;
}

/**
 * Trims at a line boundary rather than mid-word, and says so in the text.
 *
 * A model that receives a silently truncated evidence block will happily reason
 * about the half it can see. One that receives a labelled truncation knows the
 * evidence is incomplete, which is the difference between a wrong answer and a
 * hedged one.
 */
function trimToBudget(text: string, budgetTokens: number): { text: string; truncated: boolean } {
  const limit = budgetTokens * 4;
  if (text.length <= limit) return { text, truncated: false };

  const window = text.slice(0, limit);
  const lastBreak = window.lastIndexOf("\n");
  const kept = lastBreak > limit * 0.5 ? window.slice(0, lastBreak) : window;
  return { text: `${kept}\n[…trimmed to fit the context budget. Some material was not shown.]`, truncated: true };
}

export function assembleContext(stage: string, parts: Part[]): AssembledContext {
  const usage: SectionUsage[] = [];
  const rendered: string[] = [];

  for (const part of parts) {
    const body = part.text.trim();
    if (!body) continue;
    const budget = CONTEXT_BUDGET[part.section];
    const { text, truncated } = trimToBudget(body, budget);
    rendered.push(text);
    usage.push({ section: part.section, tokens: estimateTokens(text), budget, truncated });
  }

  const totalTokens = usage.reduce((sum, entry) => sum + entry.tokens, 0);
  const over = usage.filter((entry) => entry.truncated);
  if (over.length > 0) {
    log.warn(`${stage}: trimmed ${over.map((entry) => entry.section).join(", ")} to fit budget`);
  }
  log.debug(
    `${stage} context ~${totalTokens} tokens (${usage.map((u) => `${u.section} ${u.tokens}/${u.budget}`).join(", ")})`,
  );

  return { prompt: rendered.join("\n\n"), usage, totalTokens };
}
