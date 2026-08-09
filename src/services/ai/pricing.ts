/**
 * Cost estimation. USD per million tokens, matched by longest name prefix.
 *
 * This is an estimate shown to the user, not a bill. When a model is not in
 * the table the fallback is used and the figure is still directionally right,
 * which is all the token meter needs to do its job.
 */
interface Rate {
  in: number;
  out: number;
}

const RATES: ReadonlyArray<readonly [string, Rate]> = [
  // DeepSeek cache-miss rates. Cache hits are cheaper, so these estimates are
  // deliberately conservative rather than understating spend.
  ["deepseek-v4-pro", { in: 0.435, out: 0.87 }],
  ["deepseek-v4-flash", { in: 0.14, out: 0.28 }],
  ["claude-opus", { in: 15, out: 75 }],
  ["claude-sonnet", { in: 3, out: 15 }],
  ["claude-haiku", { in: 1, out: 5 }],
  ["claude-fable", { in: 3, out: 15 }],
  ["claude-3-5-haiku", { in: 0.8, out: 4 }],
  ["claude-3-haiku", { in: 0.25, out: 1.25 }],
];

const FALLBACK: Rate = { in: 3, out: 15 };

export function rateFor(model: string): Rate {
  const name = model.toLowerCase();
  let best: { length: number; rate: Rate } | null = null;
  for (const [prefix, rate] of RATES) {
    if (name.startsWith(prefix) && (!best || prefix.length > best.length)) {
      best = { length: prefix.length, rate };
    }
  }
  return best?.rate ?? FALLBACK;
}

/** USD, rounded to a sane number of places for display. */
export function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const rate = rateFor(model);
  const cost = (tokensIn / 1_000_000) * rate.in + (tokensOut / 1_000_000) * rate.out;
  return Math.round(cost * 1e6) / 1e6;
}

/** `$0.0042`, or `$0.00` when a run genuinely cost nothing (sandbox). */
export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
