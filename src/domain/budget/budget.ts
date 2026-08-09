import "server-only";
import { dateKey } from "@/lib/ids";
import { readSettings } from "@/domain/settings/store";
import { runStore } from "@/services/runs/recorder";

export interface BudgetStatus {
  date: string;
  tokensUsed: number;
  tokensBudget: number;
  /** 0–1, clamped. The meter fills to --partial from 0.8 and stops at 1. */
  fraction: number;
  costToday: number;
  runsToday: number;
  maxRunsPerDay: number;
  cooldownSeconds: number;
  secondsUntilNextRun: number;
  /** True when an expensive action should be disabled unless overridden. */
  overBudget: boolean;
  atRunLimit: boolean;
  lastRunAt: string | null;
}

/**
 * Today's spend, derived from the run files rather than a counter. A counter
 * would drift; the runs are the truth, and there are never enough of them in a
 * day for this to be slow.
 */
export async function getBudgetStatus(now: Date = new Date()): Promise<BudgetStatus> {
  const settings = await readSettings();
  const today = dateKey(now);
  const runs = (await runStore.list()).filter((run) => dateKey(new Date(run.startedAt)) === today);

  // Sandbox runs cost nothing and must not eat a real budget.
  const billable = runs.filter((run) => !run.sandbox);

  const tokensUsed = billable.reduce((sum, run) => sum + run.totalTokensIn + run.totalTokensOut, 0);
  const costToday = billable.reduce((sum, run) => sum + run.totalCost, 0);
  const tokensBudget = settings.budget.dailyTokenBudget;

  const lastStart = runs.reduce<string | null>(
    (latest, run) => (latest === null || run.startedAt > latest ? run.startedAt : latest),
    null,
  );

  const sinceLastMs = lastStart ? now.getTime() - new Date(lastStart).getTime() : Number.POSITIVE_INFINITY;
  const cooldownMs = settings.budget.cooldownSeconds * 1000;
  const secondsUntilNextRun = Number.isFinite(sinceLastMs)
    ? Math.max(0, Math.ceil((cooldownMs - sinceLastMs) / 1000))
    : 0;

  return {
    date: today,
    tokensUsed,
    tokensBudget,
    fraction: tokensBudget > 0 ? Math.min(1, tokensUsed / tokensBudget) : 0,
    costToday,
    runsToday: billable.length,
    maxRunsPerDay: settings.budget.maxRunsPerDay,
    cooldownSeconds: settings.budget.cooldownSeconds,
    secondsUntilNextRun,
    overBudget: tokensBudget > 0 && tokensUsed >= tokensBudget,
    atRunLimit: billable.length >= settings.budget.maxRunsPerDay,
    lastRunAt: lastStart,
  };
}

export interface GateResult {
  allowed: boolean;
  reason?: string;
}

/**
 * The gate every expensive action passes through. `override` is the explicit
 * button the user presses when they mean it — it skips the budget and run-count
 * limits, but never the cooldown, which exists to stop double-fires.
 */
export function gate(status: BudgetStatus, override: boolean): GateResult {
  if (status.secondsUntilNextRun > 0) {
    return {
      allowed: false,
      reason: `Cooldown. Next run available in ${status.secondsUntilNextRun}s.`,
    };
  }
  if (override) return { allowed: true };
  if (status.overBudget) {
    return {
      allowed: false,
      reason: `Today's token budget is spent (${status.tokensUsed.toLocaleString()} of ${status.tokensBudget.toLocaleString()}). Raise the budget in Settings, or run anyway.`,
    };
  }
  if (status.atRunLimit) {
    return {
      allowed: false,
      reason: `You have used all ${status.maxRunsPerDay} runs for today. Raise the limit in Settings, or run anyway.`,
    };
  }
  return { allowed: true };
}
