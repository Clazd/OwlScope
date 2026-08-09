"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { DiffList } from "@/components/common/DiffList";
import { TextInput } from "@/components/common/Field";
import { MicroLabel } from "@/components/common/MicroLabel";
import { useRegisterCommands } from "@/components/common/command-registry";
import { useToast } from "@/components/common/Toast";
import { useDialogFocus } from "@/components/common/use-dialog-focus";
import { diffSnapshot } from "@/domain/persona/diff";
import type { Fingerprint, Persona, PersonaSnapshot, Sample } from "@/domain/persona/schema";
import { normaliseWeights } from "@/domain/persona/weights";
import { BeliefsSection, BoundariesSection } from "./BeliefsSection";
import { FingerprintSection } from "./FingerprintSection";
import { IdentitySection } from "./IdentitySection";
import { PillarsSection } from "./PillarsSection";
import { PersonaInbox } from "./PersonaInbox";
import { SectionIndex } from "./section-chrome";
import { TestVoicePanel } from "./TestVoicePanel";
import { VersionsSection, type VersionHeader } from "./VersionsSection";
import { ExperienceSection, VoiceRulesSection } from "./VoiceRulesSection";

interface Props {
  initial: PersonaSnapshot;
  versions: VersionHeader[];
}

/**
 * The Brain editing surface.
 *
 * All state lives here as one snapshot, so the change count is computed the
 * same way the server computes it — the diff shown before a save is the diff
 * that gets saved, not an approximation of it.
 */
export function BrainEditor({ initial, versions: initialVersions }: Props) {
  const toast = useToast();
  const router = useRouter();

  const [saved, setSaved] = useState<PersonaSnapshot>(initial);
  const [draft, setDraft] = useState<PersonaSnapshot>(initial);
  const [versions, setVersions] = useState(initialVersions);
  const [confirming, setConfirming] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [saving, setSaving] = useState(false);
  const saveDialogRef = useDialogFocus<HTMLDivElement>(confirming, () => setConfirming(false));

  // Weights are normalised before comparing, so the diff never reports a
  // rounding difference the user did not make.
  const normalised = useMemo<PersonaSnapshot>(
    () => ({ ...draft, persona: { ...draft.persona, pillars: normaliseWeights(draft.persona.pillars) } }),
    [draft],
  );
  const changes = useMemo(() => diffSnapshot(saved, normalised), [saved, normalised]);
  const dirty = changes.length > 0;
  const nextVersion = (versions[0]?.version ?? 0) + 1;

  const patchPersona = useCallback((changesToPersona: Partial<Persona>) => {
    setDraft((current) => ({ ...current, persona: { ...current.persona, ...changesToPersona } }));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/persona", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshot: normalised, changeReason }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.show(body.error ?? "The persona could not be saved.", "failure");
        return;
      }
      setSaved(body.snapshot);
      setDraft(body.snapshot);
      setConfirming(false);
      setChangeReason("");
      await refreshVersions();
      toast.show(`Saved version ${body.version}.`);
      // The sidebar shows the persona name and the layout reads it on the
      // server, so a rename has to reach the shell too.
      router.refresh();
    } catch (err) {
      toast.show(`The persona could not be saved: ${(err as Error).message}`, "failure");
    } finally {
      setSaving(false);
    }
  }

  async function refreshVersions() {
    try {
      const response = await fetch("/api/persona/versions");
      if (response.ok) setVersions(await response.json());
    } catch {
      /* the list is a convenience; a stale one is not worth an error */
    }
  }

  function discard() {
    if (!window.confirm(`Discard ${changes.length} unsaved change${changes.length === 1 ? "" : "s"}?`)) return;
    setDraft(saved);
    toast.show("Changes discarded.");
  }

  function onRestored(snapshot: PersonaSnapshot) {
    setSaved(snapshot);
    setDraft(snapshot);
    void refreshVersions();
    router.refresh();
  }

  useRegisterCommands(
    [
      {
        id: "brain:save",
        label: "Save persona as a new version",
        group: "Brain",
        keywords: "persona version save",
        run: () => (dirty ? setConfirming(true) : toast.show("Nothing has changed yet.")),
      },
      {
        id: "brain:discard",
        label: "Discard unsaved persona changes",
        group: "Brain",
        run: () => (dirty ? discard() : toast.show("Nothing has changed yet.")),
      },
    ],
    [dirty, changes.length],
  );

  return (
    <div className="px-6 py-6">
      <div className="grid gap-8 wide:grid-cols-[200px_minmax(0,1fr)]">
        {/*
          min-w-0 is load-bearing: a grid item defaults to min-width:auto, so
          without it the index grows to fit its widest content and the strip
          never scrolls — it just pushes the page sideways.
        */}
        <div className="min-w-0 max-wide:sticky max-wide:top-0 max-wide:z-10 max-wide:-mx-6 max-wide:border-b max-wide:border-rule max-wide:bg-bg max-wide:px-6">
          <SectionIndex
            counts={{
              pillars: draft.persona.pillars.length,
              beliefs: draft.persona.beliefs.length,
              "voice-rules": draft.persona.voiceRules.length,
              experience: draft.experience.length,
              versions: versions.length,
            }}
          />
        </div>

        <div className="min-w-0 space-y-8">
          <PersonaInbox snapshot={draft} onUseProposal={setDraft} />

          <IdentitySection persona={draft.persona} onChange={patchPersona} />

          <PillarsSection
            pillars={draft.persona.pillars}
            onChange={(pillars) => patchPersona({ pillars })}
          />

          <BeliefsSection
            beliefs={draft.persona.beliefs}
            pillars={draft.persona.pillars}
            onChange={(beliefs) => patchPersona({ beliefs })}
          />

          <BoundariesSection
            boundaries={draft.persona.boundaries}
            onChange={(boundaries) => patchPersona({ boundaries })}
          />

          <FingerprintSection
            fingerprint={draft.fingerprint}
            samples={draft.samples}
            persona={draft.persona}
            onFingerprintChange={(fingerprint: Fingerprint | null) =>
              setDraft((current) => ({ ...current, fingerprint }))
            }
            onSamplesChange={(samples: Sample[]) => setDraft((current) => ({ ...current, samples }))}
            onPersonaChange={patchPersona}
          />

          <VoiceRulesSection
            rules={draft.persona.voiceRules}
            onChange={(voiceRules) => patchPersona({ voiceRules })}
          />

          <ExperienceSection
            experience={draft.experience}
            onChange={(experience) => setDraft((current) => ({ ...current, experience }))}
          />

          <VersionsSection
            versions={versions}
            activeVersion={draft.persona.activeVersion}
            onRestored={onRestored}
          />

          <TestVoicePanel persona={draft.persona} fingerprint={draft.fingerprint} dirty={dirty} />
        </div>
      </div>

      {dirty && (
        <div inert={confirming} className="sticky bottom-0 -mx-6 mt-8 flex flex-wrap items-center gap-3 border-t border-rule bg-bg px-6 py-3">
          <Button variant="primary" onClick={() => setConfirming(true)}>
            Save as version {nextVersion}
          </Button>
          <Button variant="quiet" onClick={discard}>
            Discard
          </Button>
          <MicroLabel>
            draft only · {changes.length} unsaved change{changes.length === 1 ? "" : "s"}
          </MicroLabel>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 px-4">
          <button
            type="button"
            aria-label="Cancel"
            tabIndex={-1}
            onClick={() => setConfirming(false)}
            className="fixed inset-0 cursor-default"
          />
          <div
            ref={saveDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm save"
            tabIndex={-1}
            className="relative flex max-h-[80vh] w-full max-w-[560px] flex-col rounded-card border border-rule bg-surface shadow-pop"
          >
            <header className="border-b border-rule px-6 py-4">
              <h2 className="type-h2 text-ink">
                {changes.length} change{changes.length === 1 ? "" : "s"} will create version {nextVersion}
              </h2>
            </header>

            <div className="grow overflow-y-auto px-6 py-4">
              <DiffList entries={changes} />
            </div>

            <footer className="space-y-3 border-t border-rule px-6 py-4">
              <TextInput
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="Why this change? Optional."
                aria-label="Change reason"
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={save} disabled={saving}>
                  {saving ? "Saving" : `Save as version ${nextVersion}`}
                </Button>
                <Button variant="quiet" onClick={() => setConfirming(false)}>
                  Keep editing
                </Button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

/** Shown when there is no persona at all. */
export function BrainEmptyState() {
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function loadDemo() {
    setLoading(true);
    try {
      const response = await fetch("/api/persona/demo", { method: "POST" });
      const body = await response.json();
      if (!response.ok) {
        toast.show(body.error ?? "The demo persona could not be loaded.", "failure");
        return;
      }
      toast.show("Loaded the Nova demo persona.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card padding="24" className="mx-6 mb-6">
      <p className="type-body reading-column text-ink-2">
        Prefer a guided setup? Onboarding asks one question per screen. The demo loads a complete worked example.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => router.push("/onboarding")}>
          Guided onboarding
        </Button>
        <Button onClick={loadDemo} disabled={loading}>
          {loading ? "Loading" : "Load the Nova demo persona"}
        </Button>
      </div>
    </Card>
  );
}
