"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/EmptyState";
import { Field, RadioRow, TextInput } from "@/components/common/Field";
import { MicroLabel } from "@/components/common/MicroLabel";
import { PostVisual } from "@/components/common/PostVisual";
import { ReasonChips } from "@/components/common/ReasonChips";
import { SentenceManuscript, type ManuscriptSentence } from "@/components/common/SentenceManuscript";
import { XPreviewCard } from "@/components/common/XPreviewCard";
import type { EpistemicState } from "@/components/common/EpistemicChip";
import type { ContentItem, GateReport, Sentence, Source, StudioDraft } from "@/domain/studio/schema";
import { shortAge } from "./client";

const REJECT_REASONS = [
  { id: "off-voice", label: "Not my voice" },
  { id: "not-interesting", label: "Not interesting" },
  { id: "already-said", label: "Already said this" },
  { id: "too-weak", label: "Evidence too thin" },
  { id: "wrong-angle", label: "Wrong angle" },
  { id: "bad-timing", label: "Bad timing" },
];

interface FinalStageProps {
  draft: StudioDraft | null;
  sources: Source[];
  content: ContentItem | null;
  gates: GateReport | null;
  personaName: string;
  handle: string;
  reasoning: string;
  busy: boolean;
  onFinalise: (override: { reason: string; sentenceIds: string[] } | null) => void;
  onCopy: () => void;
  onMarkPublished: (url: string | null) => void;
  onSaveDraft: () => void;
  onReject: (reasons: string[]) => void;
  onBackToEdit: () => void;
  highlightId: string | null;
  onOpenSource: (id: string) => void;
}

/** The four claim types map onto the four epistemic colours, once, here. */
function stateOf(sentence: Sentence): EpistemicState {
  if (sentence.claimType === "opinion" || sentence.claimType === "rhetorical") return "opinion";
  if (sentence.support === "supported") return "supported";
  if (sentence.support === "partial") return "partial";
  return "unsupported";
}

/**
 * Stage 6. The finished post, its evidence, its reasoning, and five actions.
 *
 * Copy is one of them and it changes nothing. Only "Mark published" moves the
 * status, and it is the only control here that asks for a URL.
 */
export function FinalStage({
  draft,
  sources,
  content,
  gates,
  personaName,
  handle,
  reasoning,
  busy,
  onFinalise,
  onCopy,
  onMarkPublished,
  onSaveDraft,
  onReject,
  onBackToEdit,
  highlightId,
  onOpenSource,
}: FinalStageProps) {
  const [view, setView] = useState<"manuscript" | "preview">("manuscript");
  const [publicUrl, setPublicUrl] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [overrideReason, setOverrideReason] = useState("");

  if (!draft) {
    return <EmptyState>Nothing selected. Go back to Drafts and pick one.</EmptyState>;
  }

  const blocking = gates?.blocking ?? [];
  const unsupportedIds = draft.sentences
    .filter((sentence) => sentence.claimType === "fact" && sentence.support === "unsupported")
    .map((sentence) => sentence.id);
  const onlyUnsupportedBlocks =
    blocking.length > 0 && blocking.every((finding) => finding.id.startsWith("unsupported:"));

  const manuscript: ManuscriptSentence[] = draft.sentences.map((sentence) => ({
    id: sentence.id,
    text: sentence.text,
    state: stateOf(sentence),
    sources: sentence.sourceIds
      .map((id) => sources.find((source) => source.id === id))
      .filter((source): source is Source => Boolean(source))
      .map((source) => ({
        id: source.id,
        domain: source.domain || source.url,
        age: shortAge(source.publishedAt),
        quality: source.sourceQuality,
      })),
  }));

  if (!content) {
    return (
      <div className="space-y-4">
        <Card padding="24" label="Ready to finalise">
          <p className="type-body reading-column text-ink-2">
            Finalising writes the post to <span data-mono className="type-data">/data/content/</span> as a
            draft, with its evidence, critique and reasoning attached. It does not publish anything.
          </p>

          {blocking.length > 0 && (
            <div className="mt-4 border-t border-rule pt-4">
              <MicroLabel className="mb-2 block">Blocked</MicroLabel>
              <ul className="space-y-2">
                {blocking.map((finding) => (
                  <li key={finding.id} className="type-body text-unsupported">
                    {finding.message}
                  </li>
                ))}
              </ul>

              {onlyUnsupportedBlocks && (
                <div className="mt-4">
                  <Field
                    label="Override"
                    hint="Recorded on the post, naming the sentences it covers. Confirming one does not clear the next."
                  >
                    <TextInput
                      value={overrideReason}
                      onChange={(event) => setOverrideReason(event.target.value)}
                      placeholder="Why this ships anyway"
                    />
                  </Field>
                  <Button
                    variant="destructive"
                    disabled={busy || overrideReason.trim().length === 0}
                    onClick={() => onFinalise({ reason: overrideReason.trim(), sentenceIds: unsupportedIds })}
                  >
                    Finalise with a recorded override
                  </Button>
                </div>
              )}
            </div>
          )}

          {blocking.length === 0 && (
            <div className="mt-4">
              <Button variant="primary" disabled={busy} onClick={() => onFinalise(null)}>
                {busy ? "Finalising…" : "Finalise"}
              </Button>
            </div>
          )}
        </Card>

        <ManuscriptCard
          view={view}
          setView={setView}
          manuscript={manuscript}
          draft={draft}
          personaName={personaName}
          handle={handle}
          highlightId={highlightId}
          onOpenSource={onOpenSource}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ManuscriptCard
        view={view}
        setView={setView}
        manuscript={manuscript}
        draft={draft}
        personaName={personaName}
        handle={handle}
        highlightId={highlightId}
        onOpenSource={onOpenSource}
      />

      <Card padding="24" label="Why this post">
        <p className="type-body reading-column text-ink-2">{reasoning || content.reasoning}</p>
      </Card>

      <Card padding="24">
        {/* Keyed on the id so finalising a different draft harvests afresh. */}
        <PostVisual key={content.id} contentId={content.id} />
      </Card>

      {content.override && (
        <Card padding="24" label="Override recorded" className="border-unsupported">
          <p className="type-body text-ink">{content.override.reason}</p>
          <p data-mono className="type-data mt-2 text-ink-3">
            covers {content.override.sentenceIds.join(", ")}
          </p>
        </Card>
      )}

      <Card padding="24" label={`Status · ${content.status}`}>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={onCopy}>
            Copy post
          </Button>
          <Button variant="secondary" disabled={busy || content.status === "published"} onClick={() => onMarkPublished(publicUrl.trim() || null)}>
            Mark published
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onSaveDraft}>
            Save draft
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => setRejecting((current) => !current)}>
            Reject
          </Button>
          <Button variant="quiet" disabled={busy} onClick={onBackToEdit}>
            Return to edit
          </Button>
        </div>

        <p className="type-small mt-3 text-ink-3">
          Copying never changes the status. Only “Mark published” does.
        </p>

        <Field label="Public URL" hint="Optional. Recorded when you mark it published." className="mt-3">
          <TextInput
            mono
            value={publicUrl}
            onChange={(event) => setPublicUrl(event.target.value)}
            placeholder="https://x.com/…"
          />
        </Field>

        {rejecting && (
          <div className="mt-4 border-t border-rule pt-4">
            <MicroLabel className="mb-2 block">Why not?</MicroLabel>
            <ReasonChips reasons={REJECT_REASONS} selected={reasons} onChange={setReasons} />
            <p className="type-small mt-2 text-ink-3">
              This tunes what gets selected next time. It never changes the persona.
            </p>
            <Button
              variant="destructive"
              className="mt-3"
              disabled={busy}
              onClick={() => {
                onReject(reasons);
                setRejecting(false);
              }}
            >
              Confirm rejection
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function ManuscriptCard({
  view,
  setView,
  manuscript,
  draft,
  personaName,
  handle,
  highlightId,
  onOpenSource,
}: {
  view: "manuscript" | "preview";
  setView: (next: "manuscript" | "preview") => void;
  manuscript: ManuscriptSentence[];
  draft: StudioDraft;
  personaName: string;
  handle: string;
  highlightId: string | null;
  onOpenSource: (id: string) => void;
}) {
  return (
    <Card
      padding="24"
      label="The post"
      action={
        <RadioRow
          name="View"
          value={view}
          onChange={setView}
          options={[
            { value: "manuscript", label: "Manuscript" },
            { value: "preview", label: "Preview" },
          ]}
        />
      }
    >
      {view === "manuscript" ? (
        <SentenceManuscript
          sentences={manuscript}
          highlightId={highlightId}
          onOpenSource={onOpenSource}
        />
      ) : (
        <XPreviewCard displayName={personaName} handle={handle} text={draft.text} />
      )}
    </Card>
  );
}
