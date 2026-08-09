"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/common/Button";
import { Card, CardSection } from "@/components/common/Card";
import { TextInput } from "@/components/common/Field";
import { MicroLabel } from "@/components/common/MicroLabel";
import { ScoreBar } from "@/components/common/ScoreBar";
import { StageSpinner } from "@/components/common/StageSpinner";
import { useToast } from "@/components/common/Toast";
import { formatCost } from "@/services/ai/pricing";
import type { Deviation } from "@/domain/persona/fingerprint";
import type { Fingerprint, Persona } from "@/domain/persona/schema";

interface VoiceSample {
  text: string;
  score: number;
  deviations: Deviation[];
}

interface Props {
  persona: Persona;
  fingerprint: Fingerprint | null;
  /** True when the editor has unsaved edits, so the copy can say what is tested. */
  dirty: boolean;
}

/**
 * Two or three sample posts on a topic you choose. Nothing is saved to content
 * history - this is a tuning surface, and it is the only way to see whether the
 * persona works before slice 3 exists.
 */
export function TestVoicePanel({ persona, fingerprint, dirty }: Props) {
  const toast = useToast();
  const [topic, setTopic] = useState("");
  const [running, setRunning] = useState(false);
  const [samples, setSamples] = useState<VoiceSample[] | null>(null);
  const [meta, setMeta] = useState<{ runId: string; cost: number; sandbox: boolean } | null>(null);

  async function run() {
    if (!topic.trim()) {
      toast.show("Enter a topic to test against.", "failure");
      return;
    }
    setRunning(true);
    setSamples(null);
    try {
      const response = await fetch("/api/test-voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          // The editor's current state, so you can tune and test without
          // committing a version first.
          persona,
          fingerprint,
          idempotencyKey: `test-voice-${Date.now()}`,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.show(body.error ?? "The test failed.", "failure");
        return;
      }
      setSamples(body.samples);
      setMeta({ runId: body.runId, cost: body.costEstimate, sandbox: body.sandbox });
    } catch (err) {
      toast.show(`The test failed: ${(err as Error).message}`, "failure");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card label="Test voice" padding="24">
      <p className="type-small mb-3 text-ink-3">
        Sample posts on a topic you pick. Nothing here is saved to content history.
        {dirty && " Your unsaved edits are used, so you can tune before committing a version."}
      </p>

      <div className="flex flex-wrap gap-2">
        <TextInput
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          placeholder="A topic to write about"
          className="min-w-[220px] grow"
        />
        <Button variant="primary" onClick={run} disabled={running}>
          {running ? "Writing" : "Test voice"}
        </Button>
      </div>

      {running && (
        <div className="mt-4">
          <StageSpinner stage="Writing in your voice" />
        </div>
      )}

      {samples && (
        <div className="mt-4 space-y-4">
          {samples.map((sample, i) => (
            <CardSection key={i} label={`sample ${i + 1}`}>
              <p className="type-manuscript reading-column text-ink">{sample.text}</p>
              <div className="mt-3">
                <ScoreBar value={sample.score / 100} label="voice match" />
              </div>
              {sample.deviations.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {sample.deviations.map((deviation, j) => (
                    <li key={j} className="type-small text-ink-2">
                      <MicroLabel className="mr-2">{deviation.rule}</MicroLabel>
                      {deviation.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="type-small mt-2 text-ink-3">
                  {fingerprint
                    ? "Nothing mechanical is out of character."
                    : "No fingerprint yet, so there was nothing to check this against."}
                </p>
              )}
            </CardSection>
          ))}

          {meta && (
            <p data-mono className="type-data text-ink-3">
              {meta.sandbox ? "sandbox · " : ""}
              {formatCost(meta.cost)} ·{" "}
              <Link href={`/inspect#${meta.runId}`} className="underline underline-offset-2 hover:text-ink">
                {meta.runId}
              </Link>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
