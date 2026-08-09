import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest } from "@/domain/studio/api";
import { transitionContent } from "@/domain/studio/finalise";
import { ContentStatusSchema } from "@/domain/studio/schema";
import { TransitionError, allowedTransitions } from "@/domain/studio/state-machine";
import { contentStore } from "@/domain/studio/store";
import { createLogger } from "@/lib/logging/log";

const log = createLogger("api/studio/content");

export const dynamic = "force-dynamic";

const Body = z.object({
  contentId: z.string().min(1),
  status: ContentStatusSchema,
  /** Optional, and only meaningful on the transition to published. */
  publicUrl: z.string().nullable().optional(),
  rejectionReasons: z.array(z.string()).optional(),
});

/**
 * The state machine's only entry point.
 *
 * Note what is not here: copying. Copy is a clipboard call in the browser and
 * touches nothing on the server, so there is no way for it to change a status
 * by accident. Only an explicit "Mark published" sets `publishedAt`.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Which post, and what should it become?");

  const current = await contentStore.get(parsed.data.contentId);
  if (!current) return badRequest("That post no longer exists.");

  try {
    const updated = await transitionContent({
      contentId: parsed.data.contentId,
      to: parsed.data.status,
      publicUrl: parsed.data.publicUrl,
      rejectionReasons: parsed.data.rejectionReasons,
    });
    return NextResponse.json({ content: updated });
  } catch (err) {
    if (err instanceof TransitionError) {
      // A refused transition is a 409, not a 500: the request was well formed
      // and the server is telling the client what the rules are.
      log.warn(`refused ${err.from} -> ${err.to} on ${parsed.data.contentId}`);
      return NextResponse.json(
        { error: err.message, from: err.from, allowed: allowedTransitions(err.from) },
        { status: 409 },
      );
    }
    throw err;
  }
}
