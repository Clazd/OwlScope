import type { ContentStatus } from "./schema";

/**
 * The content state machine, enforced server-side.
 *
 *   draft → reviewing → accepted → published
 *   alternates: rejected · archived
 *
 * Two rules matter more than the diagram. Generated is never treated as
 * published: a fresh item starts at `draft` and nothing moves it on its own.
 * And copying is not a transition at all — it is not in this file, because the
 * copy button never calls it.
 */

const FORWARD: Record<ContentStatus, ContentStatus[]> = {
  draft: ["reviewing", "rejected", "archived"],
  reviewing: ["accepted", "draft", "rejected", "archived"],
  accepted: ["published", "reviewing", "rejected", "archived"],
  published: ["archived"],
  rejected: ["archived", "draft"],
  archived: [],
};

export const TERMINAL_STATUSES: ContentStatus[] = ["published", "archived"];

export function allowedTransitions(from: ContentStatus): ContentStatus[] {
  return FORWARD[from];
}

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return FORWARD[from].includes(to);
}

export class TransitionError extends Error {
  readonly from: ContentStatus;
  readonly to: ContentStatus;

  constructor(from: ContentStatus, to: ContentStatus) {
    const allowed = FORWARD[from];
    super(
      allowed.length === 0
        ? `A ${from} post cannot change status.`
        : `A ${from} post cannot become ${to}. It can become: ${allowed.join(", ")}.`,
    );
    this.name = "TransitionError";
    this.from = from;
    this.to = to;
  }
}

/** Throws rather than returning false, because every caller is a write path. */
export function assertTransition(from: ContentStatus, to: ContentStatus): void {
  if (from === to) return;
  if (!canTransition(from, to)) throw new TransitionError(from, to);
}

/**
 * `publishedAt` is set by exactly one transition and cleared by none.
 *
 * It lives here rather than in the route handler so that "only Mark published
 * marks anything published" is a property of the state machine and not of one
 * caller remembering to set a field.
 */
export function applyTransition(
  current: { status: ContentStatus; publishedAt: string | null; publicUrl: string | null },
  to: ContentStatus,
  options: { publicUrl?: string | null; now?: string } = {},
): { status: ContentStatus; publishedAt: string | null; publicUrl: string | null } {
  assertTransition(current.status, to);
  if (to !== "published") {
    return { ...current, status: to };
  }
  return {
    status: "published",
    publishedAt: options.now ?? new Date().toISOString(),
    publicUrl: options.publicUrl?.trim() || null,
  };
}
