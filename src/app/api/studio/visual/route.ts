import { NextResponse } from "next/server";
import { z } from "zod";
import { getBudgetStatus } from "@/domain/budget/budget";
import { readPersonaOrEmpty } from "@/domain/persona/store";
import { badRequest, stageErrorResponse } from "@/domain/studio/api";
import { contentStore, sourcesByIds } from "@/domain/studio/store";
import { harvestSourceImages, runVisualPrompt } from "@/domain/studio/visual";
import type { Source, ThreadRecord, VisualPromptRecord } from "@/domain/studio/schema";
import { getProvider } from "@/services/ai/provider";
import { startRun } from "@/services/runs/recorder";

export const dynamic = "force-dynamic";

/**
 * The visual panel's two halves.
 *
 * GET harvests: it reads each source page for the image that page offers for
 * sharing. No model, no tokens, cached, and safe to call on every view.
 *
 * POST writes an image prompt. That one costs money, so it is a button and
 * never a side effect of looking at a post.
 */

/** What the client needs to show and credit an image. Never the whole source. */
function forClient(source: Source) {
  return {
    id: source.id,
    title: source.title,
    domain: source.domain,
    url: source.url,
    quality: source.sourceQuality,
    image: source.image ?? null,
    checked: Boolean(source.imageCheckedAt),
  };
}

export async function GET(request: Request) {
  const contentId = new URL(request.url).searchParams.get("contentId");
  if (!contentId) return badRequest("Which post?");
  const content = await contentStore.get(contentId);
  if (!content) return badRequest("That post no longer exists.");

  const sources = await sourcesByIds(content.sourceIds);
  const harvest = await harvestSourceImages(sources);

  return NextResponse.json({
    sources: harvest.sources.map(forClient),
    unreachable: harvest.unreachable,
    visualPrompt: content.visualPrompt ?? null,
    thread: content.thread ?? null,
  });
}

const Body = z.object({
  contentId: z.string().min(1),
  /** Set when the brief is for one post of a thread. Absent means the post itself. */
  postIndex: z.number().int().min(1).optional(),
  override: z.boolean().optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return badRequest("Which post needs an image prompt?");

  const content = await contentStore.get(parsed.data.contentId);
  if (!content) return badRequest("That post no longer exists.");

  const postIndex = parsed.data.postIndex;
  const post = postIndex ? content.thread?.posts.find((entry) => entry.index === postIndex) : null;
  if (postIndex && !post) return badRequest(`This post has no thread post ${postIndex}.`);

  // Post 1 of a thread is the post itself. If it already has a brief, that is
  // the brief - asking for it twice would be paying twice for the same picture.
  if (post && post.index === 1 && content.visualPrompt) {
    const saved = await contentStore.put({
      ...content,
      thread: writePromptToPost(content.thread, post.index, content.visualPrompt),
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ visualPrompt: content.visualPrompt, thread: saved.thread, reused: true });
  }

  // The full gate's cooldown exists to stop a 20k-token daily run firing twice.
  // This is one small fast-tier call the user explicitly asked for, so only the
  // budget itself applies - a cooldown here would just refuse the obvious next
  // thing somebody wants after generating a post.
  const budget = await getBudgetStatus();
  if (budget.overBudget && !parsed.data.override) {
    return NextResponse.json(
      {
        error: `Today's token budget is spent (${budget.tokensUsed.toLocaleString()} of ${budget.tokensBudget.toLocaleString()}). An image prompt costs about 1k more.`,
        budget,
      },
      { status: 429 },
    );
  }

  const [persona, resolved, sources] = await Promise.all([
    readPersonaOrEmpty(),
    getProvider(),
    sourcesByIds(content.sourceIds),
  ]);

  const recorder = await startRun({
    kind: "studio",
    personaVersion: persona.activeVersion,
    sandbox: resolved.sandbox,
  });

  try {
    const result = await runVisualPrompt({
      content: post ? { ...content, text: post.text } : content,
      persona,
      sources,
      position: post ? { index: post.index, total: content.thread?.posts.length ?? 1 } : undefined,
      recorder,
    });
    await recorder.finish("done");

    const record = { ...result.output, model: result.model, createdAt: new Date().toISOString() };
    const saved = await contentStore.put({
      ...content,
      // A brief for one post of a thread belongs on that post. Only the lone-post
      // brief is the content item's own.
      visualPrompt: post ? content.visualPrompt : record,
      thread: post ? writePromptToPost(content.thread, post.index, record) : content.thread,
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ visualPrompt: record, thread: saved.thread, runId: recorder.id });
  } catch (err) {
    await recorder.finish("failed");
    return stageErrorResponse(err);
  }
}

function writePromptToPost(
  thread: ThreadRecord | null,
  index: number,
  visualPrompt: VisualPromptRecord,
): ThreadRecord | null {
  if (!thread) return null;
  return {
    ...thread,
    posts: thread.posts.map((post) => (post.index === index ? { ...post, visualPrompt } : post)),
  };
}
