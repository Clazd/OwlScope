import type { Persona } from "@/domain/persona/schema";

/**
 * Interleave pillars before subtopics so one detailed pillar cannot consume the
 * entire provider query. Overrides replace only their own pillar's terms.
 */
export function keywordsFor(persona: Persona, overrides: Record<string, string[]>): string[] {
  const groups = persona.pillars
    .filter((pillar) => pillar.enabled)
    .map((pillar) => {
      const override = overrides[pillar.id]?.map((value) => value.trim()).filter(Boolean);
      return override?.length ? override : [pillar.name, ...pillar.subtopics].map((value) => value.trim()).filter(Boolean);
    });
  const interleaved: string[] = [];
  const seen = new Set<string>();
  const width = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < width; index += 1) {
    for (const group of groups) {
      const value = group[index];
      const key = value?.toLowerCase();
      if (!value || !key || seen.has(key)) continue;
      seen.add(key);
      interleaved.push(value);
    }
  }
  return interleaved;
}

export function queryFor(persona: Persona, keywords: string[]): string {
  return keywords.slice(0, 8).join(" OR ") || persona.identityStatement || "software technology";
}
