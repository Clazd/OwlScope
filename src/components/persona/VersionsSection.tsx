"use client";

import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { MicroLabel } from "@/components/common/MicroLabel";
import { useToast } from "@/components/common/Toast";
import { formatStamp } from "@/lib/format/display";
import type { PersonaSnapshot } from "@/domain/persona/schema";
import { Section } from "./section-chrome";

export interface VersionHeader {
  version: number;
  changeReason: string;
  changeCount: number;
  createdAt: string;
  personaName: string;
}

interface Props {
  versions: VersionHeader[];
  activeVersion: number;
  onRestored: (snapshot: PersonaSnapshot) => void;
}

export function VersionsSection({ versions, activeVersion, onRestored }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  async function restore(version: number) {
    if (!window.confirm(`Restore version ${version}? This creates a new version rather than rewriting history.`)) {
      return;
    }
    setBusy(version);
    try {
      const response = await fetch("/api/persona/versions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restore: version }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast.show(body.error ?? "The restore failed.", "failure");
        return;
      }
      onRestored(body.snapshot);
      toast.show(`Restored version ${version} as version ${body.version}.`);
    } catch (err) {
      toast.show(`The restore failed: ${(err as Error).message}`, "failure");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section
      id="versions"
      title="Versions"
      intro="Every save is a full snapshot. Every generated post records the version that wrote it, which is what makes “my posts got worse last week” a debuggable claim rather than a feeling."
    >
      <Card padding="24">
        {versions.length === 0 && (
          <p className="type-small text-ink-3">
            No versions yet. The first save creates version 1.
          </p>
        )}

        {versions.map((version) => {
          const isActive = version.version === activeVersion;
          return (
            <div
              key={version.version}
              className="flex flex-wrap items-start justify-between gap-3 border-t border-rule py-3 first:border-t-0 first:pt-0"
            >
              <div className="min-w-0">
                <p className="type-body-strong text-ink">
                  Version {version.version}
                  {isActive && <MicroLabel className="ml-2">active</MicroLabel>}
                </p>
                <p className="type-small mt-1 text-ink-2">
                  {version.changeReason || "No reason given."}
                </p>
                <p data-mono className="type-data mt-1 text-ink-3">
                  {formatStamp(version.createdAt)} · {version.changeCount} change
                  {version.changeCount === 1 ? "" : "s"}
                </p>
              </div>
              {!isActive && (
                <Button onClick={() => restore(version.version)} disabled={busy !== null}>
                  {busy === version.version ? "Restoring" : "Restore"}
                </Button>
              )}
            </div>
          );
        })}
      </Card>
    </Section>
  );
}
