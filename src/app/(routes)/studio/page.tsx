import { PageBody } from "@/components/common/PageBody";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export default function StudioPage() {
  return (
    <>
      <PageHeader title="Studio" subtitle="Draft, evidence, critique" />
      <PageBody>
        <EmptyState>
          Nothing in the studio. Writing, the evidence margin and the self-critique pass arrive in
          slice 3.
        </EmptyState>
      </PageBody>
    </>
  );
}
