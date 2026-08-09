import { PageBody } from "@/components/common/PageBody";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export default function MemoryPage() {
  return (
    <>
      <PageHeader title="Memory" subtitle="What has already been said" />
      <PageBody>
        <EmptyState>
          Nothing published yet. Every candidate gets checked against this archive before it is
          recommended, so it stays empty until the first post ships.
        </EmptyState>
      </PageBody>
    </>
  );
}
