import { NextResponse } from "next/server";
import { z } from "zod";
import { getBudgetStatus } from "@/domain/budget/budget";
import { readPersonaOrEmpty } from "@/domain/persona/store";
import { badRequest, stageErrorResponse } from "@/domain/studio/api";
import { contentHistory, contentStore, sessionStore, sourcesByIds } from "@/domain/studio/store";
import { runThread } from "@/domain/studio/thread";
import { harvestSourceImages } from "@/domain/studio/visual";
import type { StudioSession } from "@/domain/studio/schema";
import { getProvider } from "@/services/ai/provider";
import { startRun } from "@/services/runs/recorder";

export const dynamic = "force-dynamic";

/**
 * Expanding a finalised post into a thread.
 *
 * One button, one strong-tier call plus a validator pass, and it overwrites
 * whatever thread was there before - a second thread on the same post is a
 * replacement, not an addition, and pretending otherwise would leave two threads
 * on disk with no way to say which one is the one.
 */

const Body = z.object({
  contentId: z.string().min(1),
  override: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Which post should become a thread?");

  const content = await contentStore.get(parsed.data.contentId);
  if (!content) return badRequest("That post no longer exists.");

  // Budget only, not the full gate. The cooldown exists to stop a 20k-token
  // daily run firing twice; refusing to expand the post that run just produced
  // is not what it is for. Same reasoning as the image prompt.
  const budget = await getBudgetStatus();
  if (budget.overBudget && !parsed.data.override) {
    return NextResponse.json(
      {
        error:
          `Today's token budget is spent (${budget.tokensUsed.toLocaleString()} of ` +
          `${budget.tokensBudget.toLocaleString()}). A thread costs about 5k more.`,
        budget,
      },
      { status: 429 },
    );
  }

  const [persona, resolved, sources, history, sessions] = await Promise.all([
    readPersonaOrEmpty(),
    getProvider(),
    sourcesByIds(content.sourceIds),
    contentHistory(),
    sessionStore.list({ contentId: content.id } as Partial<StudioSession>),
  ]);

  // Free, and it has to happen first: which images a post gets is decided from
  // which sources it cites, and that question cannot be answered before the
  // sources have been asked whether they offer one.
  const harvest = await harvestSourceImages(sources);

  const recorder = await startRun({
    kind: "studio",
    personaVersion: persona.activeVersion,
    sandbox: resolved.sandbox,
  });

  try {
    const result = await runThread({
      content,
      research: sessions[0]?.research ?? null,
      sources: harvest.sources,
      persona,
      recentPosts: history
        .filter((item) => item.id !== content.id)
        .slice(0, 8)
        .map((item) => ({ text: item.text, createdAt: item.createdAt })),
      recorder,
    });
    await recorder.finish("done");

    const saved = await contentStore.put({
      ...content,
      thread: {
        posts: result.posts,
        validation: result.validation,
        model: result.model,
        runId: recorder.id,
        createdAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ thread: saved.thread, runId: recorder.id });
  } catch (err) {
    await recorder.finish("failed");
    return stageErrorResponse(err);
  }
}
