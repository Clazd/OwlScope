import { PageBody } from "@/components/common/PageBody";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export default function RadarPage() {
  return (
    <>
      <PageHeader title="Radar" subtitle="Topics worth a look" />
      <PageBody>
        <EmptyState>
          No topics yet. Scanning and scoring arrive in a later slice, along with the evidence rules
          that decide which of them are allowed to become a claim.
        </EmptyState>
      </PageBody>
    </>
  );
}
