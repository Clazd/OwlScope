import "server-only";
import { createDataStore } from "@/services/storage/store-factory";
import { DIRS } from "@/services/storage/paths";
import { emptyPersona } from "./defaults";
import {
  ExperienceLogSchema,
  FingerprintSchema,
  PersonaSchema,
  PersonaVersionSchema,
  SampleSetSchema,
  type ExperienceItem,
  type ExperienceLog,
  type Fingerprint,
  type Persona,
  type PersonaSnapshot,
  type PersonaVersion,
  type Sample,
  type SampleSet,
} from "./schema";

/**
 * Every persona file goes through `createDataStore`, so all four inherit atomic
 * writes, validated reads and quarantine-on-corruption without reimplementing
 * any of it.
 *
 * persona, fingerprint, samples and experience are single documents rather than
 * one file per item: they are always read and written together, and splitting
 * them would make a save four writes that could half-apply.
 */

const personaStore = createDataStore<Persona>(DIRS.persona, "persona", PersonaSchema, {
  fileName: () => "persona.json",
});

const fingerprintStore = createDataStore<Fingerprint>(DIRS.persona, "fingerprint", FingerprintSchema, {
  fileName: () => "fingerprint.json",
});

const sampleStore = createDataStore<SampleSet>(DIRS.persona, "samples", SampleSetSchema, {
  fileName: () => "samples.json",
});

const experienceStore = createDataStore<ExperienceLog>(DIRS.persona, "experience", ExperienceLogSchema, {
  fileName: () => "experience.json",
});

export const versionStore = createDataStore<PersonaVersion>(DIRS.personaVersions, "persona-versions", PersonaVersionSchema);

/* ---------------------------------------------------------------- reads -- */

/** Null when nothing has been saved yet, so callers can show onboarding. */
export async function readPersona(): Promise<Persona | null> {
  return personaStore.get("persona");
}

/** The persona, or a blank one. Used by anything that must not branch on null. */
export async function readPersonaOrEmpty(): Promise<Persona> {
  return (await readPersona()) ?? emptyPersona();
}

export async function readFingerprint(): Promise<Fingerprint | null> {
  return fingerprintStore.get("fingerprint");
}

export async function readSamples(): Promise<Sample[]> {
  const set = await sampleStore.get("samples");
  return set?.samples ?? [];
}

export async function readExperience(): Promise<ExperienceItem[]> {
  const log = await experienceStore.get("experience");
  return log?.items ?? [];
}

export async function readSnapshot(): Promise<PersonaSnapshot> {
  const [persona, fingerprint, samples, experience] = await Promise.all([
    readPersonaOrEmpty(),
    readFingerprint(),
    readSamples(),
    readExperience(),
  ]);
  return { persona, fingerprint, samples, experience };
}

/* --------------------------------------------------------------- writes -- */

export async function writePersona(persona: Persona): Promise<Persona> {
  return personaStore.put({ ...persona, id: "persona", updatedAt: new Date().toISOString() });
}

export async function writeFingerprint(fingerprint: Fingerprint): Promise<Fingerprint> {
  return fingerprintStore.put({ ...fingerprint, id: "fingerprint" });
}

export async function writeSamples(samples: Sample[]): Promise<Sample[]> {
  const saved = await sampleStore.put({ id: "samples", samples, updatedAt: new Date().toISOString() });
  return saved.samples;
}

export async function writeExperience(items: ExperienceItem[]): Promise<ExperienceItem[]> {
  const saved = await experienceStore.put({ id: "experience", items, updatedAt: new Date().toISOString() });
  return saved.items;
}

/**
 * Writes the whole snapshot. Ordered so that persona - the file everything else
 * is keyed to - lands last: a crash mid-save leaves stale supporting files
 * rather than a persona pointing at a version that was never written.
 */
export async function writeSnapshot(snapshot: PersonaSnapshot): Promise<PersonaSnapshot> {
  await writeSamples(snapshot.samples);
  await writeExperience(snapshot.experience);
  if (snapshot.fingerprint) await writeFingerprint(snapshot.fingerprint);
  const persona = await writePersona(snapshot.persona);
  return { ...snapshot, persona };
}

/* ------------------------------------------------------------- deletion -- */

/** Removes every persona file. Used by "delete the demo persona". */
export async function deletePersonaData(): Promise<void> {
  await Promise.all([
    personaStore.remove("persona"),
    fingerprintStore.remove("fingerprint"),
    sampleStore.remove("samples"),
    experienceStore.remove("experience"),
  ]);
  for (const version of await versionStore.list()) {
    await versionStore.remove(version.id);
  }
}
