"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRegisterCommands } from "@/components/common/command-registry";
import { StageSpinner } from "@/components/common/StageSpinner";
import { useToast } from "@/components/common/Toast";
import type { Pillar } from "@/domain/persona/schema";
import { evaluateGates } from "@/domain/studio/gates";
import type {
  ContentItem,
  GateReport,
  Source,
  StudioSession,
  StudioStage,
  Topic,
  TopicFreshness,
} from "@/domain/studio/schema";
import { cn } from "@/lib/format/cn";
import { AnglesStage } from "./AnglesStage";
import { CritiqueStage } from "./CritiqueStage";
import { DraftsStage } from "./DraftsStage";
import { FinalStage } from "./FinalStage";
import { ResearchStage } from "./ResearchStage";
import { SourcePanel } from "./SourcePanel";
import { RunSummary, StageRail } from "./StageRail";
import { TopicStage } from "./TopicStage";
import { StudioError, loadSession, newKey, post } from "./client";

const SESSION_KEY = "persona-studio:session";

interface StudioProps {
  pillars: Pillar[];
  personaName: string;
  handle: string;
}

/**
 * The Studio screen: stage rail, workspace, source panel.
 *
 * All pipeline state lives on the server in the session record, and this
 * component holds a copy of it. That is deliberate — a refresh mid-critique
 * reloads the same session rather than throwing away work the user paid for.
 */
export function Studio({ pillars, personaName, handle }: StudioProps) {
  const router = useRouter();
  const toast = useToast();

  const [session, setSession] = useState<StudioSession | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [content, setContent] = useState<ContentItem | null>(null);
  // Only set when the server has ruled on this draft. Cleared whenever the
  // session changes, so a stale verdict never outlives the draft it judged.
  const [serverGates, setServerGates] = useState<GateReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  /* ------------------------------------------------------------ resuming -- */

  useEffect(() => {
    const stored = window.localStorage.getItem(SESSION_KEY);
    if (!stored) return;
    loadSession(stored)
      .then((payload) => {
        if (!payload.session) return;
        setSession(payload.session);
        setSources(payload.sources ?? []);
        if (payload.topic) setTopic(payload.topic);
        if (payload.content) setContent(payload.content);
      })
      // A session that no longer exists is not an error worth interrupting for.
      .catch(() => window.localStorage.removeItem(SESSION_KEY));
  }, []);

  useEffect(() => {
    if (session) window.localStorage.setItem(SESSION_KEY, session.id);
  }, [session]);

  /* --------------------------------------------------------------- calls -- */

  const call = useCallback(
    async (label: string, path: string, body: Record<string, unknown>) => {
      setBusy(label);
      try {
        const payload = await post(path, { ...body, idempotencyKey: newKey() });
        if (payload.session) setSession(payload.session);
        if (payload.sources) setSources(payload.sources);
        if (payload.topic) setTopic(payload.topic);
        if (payload.content) setContent(payload.content);
        // A new session state means the old verdict judged a draft that may no
        // longer exist, so it is replaced rather than left to go stale.
        setServerGates(payload.gates ?? null);
        return payload;
      } catch (err) {
        if (err instanceof StudioError && err.gates) {
          // A blocked finalisation is not a failure — it is the gates working.
          setServerGates(err.gates);
          toast.show("Blocked. See the gates below.", "failure");
          return null;
        }
        toast.show(err instanceof Error ? err.message : "Something went wrong.", "failure");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );

  const draft = useMemo(
    () => session?.drafts.find((entry) => entry.id === session.selectedDraftId) ?? null,
    [session],
  );

  /* ---------------------------------------------------------- local gates -- */

  /**
   * The gates are pure, so they are derived here rather than waited for. The
   * user sees why a post cannot ship while they are still looking at it,
   * instead of finding out by clicking Finalise.
   *
   * The server's own verdict wins whenever it has given one: it re-runs the
   * same function with the measured fingerprint deviations this side does not
   * have, so it can block on things the local pass cannot see.
   */
  const localGates = useMemo(() => {
    if (!session || !draft) return null;
    return evaluateGates({
      sentences: draft.sentences,
      characterCount: draft.characterCount,
      validation: session.validation,
      critique: session.critique,
      similarity: draft.similarity,
      fingerprintScore: draft.fingerprintScore,
      fingerprintScored: draft.fingerprintScored,
      fingerprintDeviations: [],
      boundaryBlocked: session.boundary?.blocked ?? false,
      boundaryExplanation: session.boundary?.explanation ?? "",
      staleAsCurrent: (topic?.freshness ?? "evergreen") === "current" && (session.research?.insufficient ?? false),
      overriddenSentenceIds: [],
    });
  }, [session, draft, topic]);

  const gates = serverGates ?? localGates;

  /* ------------------------------------------------------------- actions -- */

  const startTopic = useCallback(
    async (input: { title: string; summary: string; context: string; pillarId: string | null; freshness: TopicFreshness }) => {
      setBusy("Checking boundaries");
      try {
        const payload = await post("topic", { ...input, idempotencyKey: newKey() });
        if (payload.session) setSession(payload.session);
        if (payload.topic) setTopic(payload.topic);
        if (payload.blocked) toast.show("Topic blocked by a persona boundary.", "failure");
      } catch (err) {
        toast.show(err instanceof Error ? err.message : "Could not start.", "failure");
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );

  const reset = useCallback(() => {
    window.localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setTopic(null);
    setSources([]);
    setContent(null);
    setServerGates(null);
  }, []);

  const research = useCallback(
    (manualUrls?: string[]) => {
      if (!session) return;
      void call("Searching and reading", "research", { sessionId: session.id, manualUrls });
    },
    [call, session],
  );

  const copy = useCallback(() => {
    if (!draft) return;
    // Copying is a clipboard call and nothing else. It touches no route, so it
    // cannot change a status even by accident.
    void navigator.clipboard.writeText(draft.text).then(
      () => toast.show("Copied. Status unchanged."),
      () => toast.show("Could not reach the clipboard.", "failure"),
    );
  }, [draft, toast]);

  const transition = useCallback(
    async (status: string, extra: Record<string, unknown> = {}) => {
      if (!session?.contentId) return;
      setBusy("Updating");
      try {
        const payload = await post("content", { contentId: session.contentId, status, ...extra });
        if (payload.content) setContent(payload.content);
        toast.show(`Marked ${status}.`);
      } catch (err) {
        toast.show(err instanceof Error ? err.message : "Could not update.", "failure");
      } finally {
        setBusy(null);
      }
    },
    [session, toast],
  );

  /**
   * Publishing is two transitions, because the state machine has no shortcut
   * from draft to published — the intermediate states are what make "generated
   * is never treated as published" true.
   */
  const markPublished = useCallback(
    async (url: string | null) => {
      if (!content) return;
      if (content.status === "draft") await transition("reviewing");
      if (content.status !== "accepted") await transition("accepted");
      await transition("published", { publicUrl: url });
    },
    [content, transition],
  );

  const goTo = useCallback(
    (stage: StudioStage) => {
      if (!session) return;
      void call("Switching stage", "session", { sessionId: session.id, stage });
    },
    [call, session],
  );

  /* ----------------------------------------------------------- shortcuts -- */

  useRegisterCommands(
    [
      {
        id: "studio:copy",
        label: "Copy the final post",
        group: "Studio",
        shortcut: "C",
        keywords: "clipboard copy post",
        run: copy,
      },
      {
        id: "studio:publish",
        label: "Mark published",
        group: "Studio",
        shortcut: "P",
        run: () => void markPublished(null),
      },
      {
        id: "studio:reject",
        label: "Reject this post",
        group: "Studio",
        shortcut: "X",
        run: () => void transition("rejected"),
      },
      {
        id: "studio:inspect",
        label: "Inspect this run",
        group: "Studio",
        run: () => router.push("/inspect"),
      },
    ],
    [copy, markPublished, transition, router],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }

      const key = event.key.toLowerCase();
      if (key === "c" && session?.contentId) {
        event.preventDefault();
        copy();
      } else if (key === "p" && content) {
        event.preventDefault();
        void markPublished(null);
      } else if (key === "x" && content) {
        event.preventDefault();
        void transition("rejected");
      } else if (/^[1-6]$/.test(key) && session) {
        const stages: StudioStage[] = ["topic", "research", "angles", "drafts", "critique", "final"];
        const stage = stages[Number(key) - 1];
        if (stage && session.stageStates[stage] !== "pending") {
          event.preventDefault();
          goTo(stage);
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [session, content, copy, markPublished, transition, goTo]);

  /* -------------------------------------------------------------- render -- */

  const stage = session?.stage ?? "topic";

  const workspace = (() => {
    if (!session || stage === "topic") {
      return (
        <TopicStage
          topic={topic}
          boundary={session?.boundary ?? null}
          pillars={pillars}
          busy={busy !== null}
          onStart={startTopic}
          onResearch={() => research()}
          onReset={reset}
        />
      );
    }

    switch (stage) {
      case "research":
        return (
          <ResearchStage
            research={session.research}
            sources={sources}
            busy={busy !== null}
            onRun={() => research()}
            onContinue={() => void call("Finding angles", "angles", { sessionId: session.id, mode: "generate" })}
            onOpenSource={setOpenSourceId}
          />
        );
      case "angles":
        return (
          <AnglesStage
            angles={session.angles}
            pick={session.anglePick}
            selectedId={session.selectedAngleId}
            busy={busy !== null}
            onGenerate={() => void call("Finding angles", "angles", { sessionId: session.id, mode: "generate" })}
            onAskAi={() => void call("Choosing", "angles", { sessionId: session.id, mode: "pick" })}
            onSelect={(id) => setSession({ ...session, selectedAngleId: id })}
            onContinue={() => void call("Writing", "drafts", { sessionId: session.id, action: "generate" })}
          />
        );
      case "drafts":
        return (
          <DraftsStage
            drafts={session.drafts}
            selectedId={session.selectedDraftId}
            busy={busy !== null}
            onGenerate={() => void call("Writing", "drafts", { sessionId: session.id, action: "generate" })}
            onSelect={(id) => void call("Selecting", "drafts", { sessionId: session.id, action: "select", draftId: id })}
            onRevise={(id, action) => void call("Revising", "drafts", { sessionId: session.id, action, draftId: id })}
            onContinue={() => void call("Checking facts", "critique", { sessionId: session.id })}
          />
        );
      case "critique":
        return (
          <CritiqueStage
            draft={draft}
            validation={session.validation}
            critique={session.critique}
            gates={gates}
            busy={busy !== null}
            onRun={() => void call("Checking facts", "critique", { sessionId: session.id })}
            onContinue={() => goTo("final")}
            onFocusSentence={(id) => {
              setHighlightId(id);
              goTo("final");
            }}
          />
        );
      case "final":
        return (
          <FinalStage
            draft={draft}
            sources={sources}
            content={content}
            gates={gates}
            personaName={personaName}
            handle={handle}
            reasoning={session.reasoning}
            busy={busy !== null}
            onFinalise={(override) =>
              void call("Finalising", "finalise", { sessionId: session.id, override })
            }
            onCopy={copy}
            onMarkPublished={markPublished}
            onSaveDraft={() => toast.show("Already saved as a draft in /data/content/.")}
            onReject={(reasons) => void transition("rejected", { rejectionReasons: reasons })}
            onBackToEdit={() => goTo("drafts")}
            highlightId={highlightId}
            onOpenSource={setOpenSourceId}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <div className={cn("flex min-h-0 grow flex-col", "lg:flex-row")}>
      <aside className="shrink-0 border-b border-rule px-4 py-4 lg:w-[200px] lg:border-b-0 lg:border-r">
        {session ? (
          <>
            <StageRail session={session} onGoTo={goTo} busy={busy !== null} />
            <div className="mt-6">
              <RunSummary runIds={session.runIds} onInspect={() => router.push("/inspect")} />
            </div>
          </>
        ) : (
          <p className="type-small text-ink-3">Type a topic to start. Radar arrives in a later slice.</p>
        )}
      </aside>

      <main className="min-w-0 grow px-4 py-6 lg:px-6">
        {busy && <StageSpinner stage={busy} className="mb-4" />}
        {workspace}
      </main>

      <aside className="shrink-0 border-t border-rule lg:w-[280px] lg:border-t-0 lg:border-l">
        <SourcePanel
          sources={sources}
          openSourceId={openSourceId}
          onOpenSource={setOpenSourceId}
          onAddUrl={(url) => research([url])}
          busy={busy !== null}
        />
      </aside>
    </div>
  );
}
