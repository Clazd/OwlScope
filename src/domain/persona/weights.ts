import type { Pillar } from "./schema";

/**
 * Pillar weights always sum to 100 across the enabled pillars.
 *
 * Weights are soft pressure on selection, not a quota - if the best idea today
 * sits in a 10% pillar, that idea still wins. The invariant exists so the
 * numbers stay readable, not so a rotation can be enforced.
 */

const TOTAL = 100;

function roundToTotal(values: number[], total = TOTAL): number[] {
  // Largest-remainder: round everything down, then hand the leftover units to
  // whoever lost the most in rounding. Guarantees the sum is exact.
  const floors = values.map((v) => Math.floor(v));
  let remaining = total - floors.reduce((a, b) => a + b, 0);

  const order = values
    .map((v, i) => ({ i, remainder: v - Math.floor(v) }))
    .sort((a, b) => b.remainder - a.remainder);

  const out = [...floors];
  let cursor = 0;
  while (remaining > 0 && order.length > 0) {
    const target = order[cursor % order.length] as { i: number };
    out[target.i] = (out[target.i] ?? 0) + 1;
    remaining -= 1;
    cursor += 1;
  }
  return out;
}

/** Enabled pillars normalised to sum to 100. Disabled pillars keep weight 0. */
export function normaliseWeights(pillars: Pillar[]): Pillar[] {
  const enabledIndexes = pillars.map((p, i) => (p.enabled ? i : -1)).filter((i) => i >= 0);
  if (enabledIndexes.length === 0) return pillars.map((p) => ({ ...p, weight: 0 }));

  const raw = enabledIndexes.map((i) => Math.max(0, pillars[i]?.weight ?? 0));
  const sum = raw.reduce((a, b) => a + b, 0);

  // Nothing to scale from: split evenly rather than leaving every pillar at 0.
  const scaled = sum === 0 ? raw.map(() => TOTAL / raw.length) : raw.map((w) => (w / sum) * TOTAL);
  const rounded = roundToTotal(scaled);

  const next = pillars.map((p) => ({ ...p, weight: p.enabled ? p.weight : 0 }));
  enabledIndexes.forEach((pillarIndex, n) => {
    const pillar = next[pillarIndex];
    if (pillar) pillar.weight = rounded[n] ?? 0;
  });
  return next;
}

/**
 * Drag one pillar's weight; the others absorb the difference in proportion to
 * their current weights, so a nudge on one bar does not scramble the rest.
 */
export function redistributeWeights(pillars: Pillar[], pillarId: string, nextWeight: number): Pillar[] {
  const target = pillars.find((p) => p.id === pillarId);
  if (!target || !target.enabled) return normaliseWeights(pillars);

  const others = pillars.filter((p) => p.enabled && p.id !== pillarId);
  if (others.length === 0) {
    // The only enabled pillar owns all of it, whatever the slider says.
    return pillars.map((p) => ({ ...p, weight: p.id === pillarId ? TOTAL : 0 }));
  }

  const clamped = Math.max(0, Math.min(TOTAL, Math.round(nextWeight)));
  const remainder = TOTAL - clamped;
  const othersTotal = others.reduce((sum, p) => sum + Math.max(0, p.weight), 0);

  const shares =
    othersTotal === 0
      ? others.map(() => remainder / others.length)
      : others.map((p) => (Math.max(0, p.weight) / othersTotal) * remainder);
  const rounded = roundToTotal(shares, remainder);

  const byId = new Map(others.map((p, i) => [p.id, rounded[i] ?? 0]));
  return pillars.map((p) => {
    if (!p.enabled) return { ...p, weight: 0 };
    if (p.id === pillarId) return { ...p, weight: clamped };
    return { ...p, weight: byId.get(p.id) ?? 0 };
  });
}

/** Toggling a pillar redistributes what it was holding across the rest. */
export function setPillarEnabled(pillars: Pillar[], pillarId: string, enabled: boolean): Pillar[] {
  const next = pillars.map((p) => (p.id === pillarId ? { ...p, enabled } : p));
  const justEnabled = next.find((p) => p.id === pillarId);
  // A pillar coming back on with weight 0 would stay invisible; give it an
  // even share to argue from.
  if (enabled && justEnabled && justEnabled.weight === 0) {
    const enabledCount = next.filter((p) => p.enabled).length;
    justEnabled.weight = TOTAL / Math.max(1, enabledCount);
  }
  return normaliseWeights(next);
}

export function weightsSum(pillars: Pillar[]): number {
  return pillars.filter((p) => p.enabled).reduce((sum, p) => sum + p.weight, 0);
}
