import { cn } from "@/lib/format/cn";
import { MicroLabel } from "./MicroLabel";

export interface DiffEntry {
  field: string;
  before: string | null;
  after: string | null;
}

interface DiffListProps {
  entries: DiffEntry[];
  className?: string;
}

/**
 * Field-level before and after. Persona versioning uses this in slice 2, so
 * every identity change is legible rather than a silent overwrite.
 *
 * Removals are --unsupported as text only. That is the one non-claim use of an
 * epistemic hue that survives review, because "this no longer holds" is close
 * enough to the meaning to be honest rather than decorative.
 */
export function DiffList({ entries, className }: DiffListProps) {
  if (entries.length === 0) {
    return <p className="type-small text-ink-3">No fields changed.</p>;
  }

  return (
    <dl className={cn("divide-y divide-rule", className)}>
      {entries.map((entry) => (
        <div key={entry.field} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[160px_1fr]">
          <dt>
            <MicroLabel strong>{entry.field}</MicroLabel>
          </dt>
          <dd className="min-w-0 space-y-1">
            {entry.before !== null && (
              <p className="type-small text-unsupported line-through decoration-1">{entry.before}</p>
            )}
            {entry.after !== null && <p className="type-small text-ink">{entry.after}</p>}
            {entry.before === null && <MicroLabel>added</MicroLabel>}
            {entry.after === null && <MicroLabel>removed</MicroLabel>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
