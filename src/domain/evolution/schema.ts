import { z } from "zod";

export const EvolutionTargetSchema = z.enum([
  "sliders.technicalAccessible",
  "sliders.casualFormal",
  "sliders.conciseDetailed",
]);
export type EvolutionTarget = z.infer<typeof EvolutionTargetSchema>;

export const PersonaSuggestionSchema = z.object({
  id: z.string(),
  target: EvolutionTargetSchema,
  currentValue: z.number().min(0).max(100),
  proposedValue: z.number().min(0).max(100),
  evidence: z.string(),
  status: z.enum(["pending", "accepted", "rejected", "suppressed"]),
  declines: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
  personaVersion: z.number().int().min(0).nullable(),
});
export type PersonaSuggestion = z.infer<typeof PersonaSuggestionSchema>;
