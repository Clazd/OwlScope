import { PageBody } from "@/components/common/PageBody";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export default function BrainPage() {
  return (
    <>
      <PageHeader title="Brain" subtitle="Identity, pillars, beliefs, boundaries, voice" />
      <PageBody>
        <EmptyState>
          No persona yet. The persona record, its voice fingerprint and its version history land in
          slice 2 — output is grounded in that record, never in the last prompt.
        </EmptyState>
      </PageBody>
    </>
  );
}
