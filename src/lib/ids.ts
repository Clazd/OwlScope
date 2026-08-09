import { randomInt } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const SUFFIX_LENGTH = 6;

/**
 * Sortable, collision-free id: `<unix-ms>-<6 random base36 chars>`.
 *
 * Lexicographic order matches chronological order for the next ~250 years,
 * which is what makes `ls` on a data directory readable.
 */
export function newId(now: number = Date.now()): string {
  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${now}-${suffix}`;
}

const ID_PATTERN = /^\d{10,}-[0-9a-z]{6}$/;

export function isId(value: string): boolean {
  return ID_PATTERN.test(value);
}

/** The ms timestamp encoded in an id, or null if it is not one of ours. */
export function idTimestamp(id: string): number | null {
  if (!isId(id)) return null;
  const ms = Number(id.slice(0, id.indexOf("-")));
  return Number.isFinite(ms) ? ms : null;
}

/** `2026-08-09` in local time. Used for date-prefixed filenames and run folders. */
export function dateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
