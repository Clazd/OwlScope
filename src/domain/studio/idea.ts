export interface IdeaCritique {
  generic: boolean;
  reasons: string[];
}

/** Cheap first pass used by evals and seed entry before any generation. */
export function critiqueIdea(input: string): IdeaCritique {
  const text = input.trim().toLowerCase();
  const reasons: string[] = [];
  if (text.length < 45) reasons.push("The idea does not yet name a mechanism, example, or consequence.");
  if (/\b(ai|technology|world|future|innovation)\b/.test(text) && !/\b(because|when|instead|fails?|works?|cost|memory|context|evaluation)\b/.test(text)) {
    reasons.push("The idea uses a broad subject without a specific thesis.");
  }
  return { generic: reasons.length > 0, reasons };
}

export function thesisIsSpecific(thesis: string): boolean {
  return thesis.trim().length >= 45 && /\b(because|not|instead|when|than|if|problem|fix|different)\b/i.test(thesis);
}
