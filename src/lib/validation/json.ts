/**
 * Models are asked for bare JSON and usually comply. When they do not, the
 * failure is almost always a code fence or a sentence of preamble, and both are
 * cheap to strip locally. Anything stranger than that goes to the repair pass.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const attempts: string[] = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  // First balanced-looking object or array in the response.
  const firstBrace = trimmed.search(/[[{]/);
  if (firstBrace >= 0) {
    const lastBrace = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
    if (lastBrace > firstBrace) attempts.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  throw new Error("No JSON value found in the response");
}

/** Compact, human-readable rendering of Zod issues for error text and prompts. */
export function describeIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}
