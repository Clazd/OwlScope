import "server-only";
import type { DiffEntry } from "@/components/common/DiffList";
import { createLogger } from "@/lib/logging/log";
import { diffSnapshot } from "./diff";
import { versionId, type PersonaSnapshot, type PersonaVersion } from "./schema";
import { normaliseWeights } from "./weights";
import { readSnapshot, versionStore, writeSnapshot } from "./store";

const log = createLogger("persona/versions");

/**
 * Every save creates a new version. Versions are full snapshots, never deltas,
 * and are never overwritten or deleted - that is what makes "my posts got worse
 * last week" a debuggable claim instead of a feeling.
 */

export async function listVersions(): Promise<PersonaVersion[]> {
  const versions = await versionStore.list();
  return versions.sort((a, b) => b.version - a.version);
}

export async function getVersion(version: number): Promise<PersonaVersion | null> {
  return versionStore.get(versionId(version));
}

async function nextVersionNumber(): Promise<number> {
  const versions = await listVersions();
  // Derived from what is on disk, not from persona.activeVersion, so a
  // half-applied save can never overwrite an existing version file.
  return versions.reduce((highest, v) => Math.max(highest, v.version), 0) + 1;
}

export interface SaveResult {
  version: PersonaVersion;
  snapshot: PersonaSnapshot;
  changes: DiffEntry[];
}

/** What would change if this snapshot were saved. Drives the confirm dialog. */
export async function previewChanges(next: PersonaSnapshot): Promise<DiffEntry[]> {
  const current = await readSnapshot();
  return diffSnapshot(current, withNormalisedWeights(next));
}

function withNormalisedWeights(snapshot: PersonaSnapshot): PersonaSnapshot {
  return {
    ...snapshot,
    persona: { ...snapshot.persona, pillars: normaliseWeights(snapshot.persona.pillars) },
  };
}

/**
 * Saves a snapshot as a new version.
 *
 * The version file is written first and the persona last, so `activeVersion`
 * never points at a version that does not exist on disk.
 */
export async function saveAsNewVersion(
  next: PersonaSnapshot,
  changeReason: string,
): Promise<SaveResult> {
  const current = await readSnapshot();
  const normalised = withNormalisedWeights(next);
  const changes = diffSnapshot(current, normalised);
  const version = await nextVersionNumber();

  const snapshot: PersonaSnapshot = {
    ...normalised,
    persona: { ...normalised.persona, activeVersion: version },
  };

  const record: PersonaVersion = {
    id: versionId(version),
    version,
    changeReason: changeReason.trim(),
    changeCount: changes.length,
    createdAt: new Date().toISOString(),
    snapshot,
  };

  await versionStore.put(record);
  const saved = await writeSnapshot(snapshot);

  log.info(`saved version ${version} with ${changes.length} change(s)`);
  return { version: record, snapshot: saved, changes };
}

/**
 * Restoring writes the old snapshot forward as a *new* version rather than
 * rewinding to the old one. History is append-only: you can always see that a
 * restore happened, and the restored-from version is still there.
 */
export async function restoreVersion(version: number): Promise<SaveResult> {
  const target = await getVersion(version);
  if (!target) throw new Error(`There is no version ${version} on disk.`);

  return saveAsNewVersion(target.snapshot, `Restored version ${version}`);
}
