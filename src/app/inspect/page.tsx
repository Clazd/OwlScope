import Link from "next/link";
import { PageBody } from "@/components/common/PageBody";
import { PageHeader } from "@/components/common/PageHeader";
import { RunList } from "@/components/inspect/RunList";
import { runStore } from "@/services/runs/recorder";

export const dynamic = "force-dynamic";

/**
 * The run inspector. Reachable at /inspect and from the command palette, and
 * deliberately not in the nav — it is a tool for whoever is building the thing,
 * not part of the product's six areas.
 *
 * Built in slice 1 rather than at the end, because it is what makes slice 3's
 * prompt work debuggable at all.
 */
export default async function InspectPage() {
  const runs = (await runStore.list()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return (
    <>
      <PageHeader
        title="Run inspector"
        subtitle={`${runs.length} run${runs.length === 1 ? "" : "s"} on disk`}
        action={
          <Link
            href="/inspect/components"
            className="type-body-strong rounded-control border border-rule-strong px-3 py-2 text-ink hover:bg-surface-sunken"
          >
            Component gallery
          </Link>
        }
      />
      <PageBody wide>
        <p className="type-small reading-column text-ink-3">
          Structured decisions, scores, critiques and operational metadata only. Chain of thought is
          never stored and never displayed.
        </p>
        <RunList runs={runs} />
      </PageBody>
    </>
  );
}
