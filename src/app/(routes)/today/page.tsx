import { PageBody } from "@/components/common/PageBody";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { formatLongDate } from "@/lib/format/display";

export const dynamic = "force-dynamic";

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Today" subtitle={formatLongDate(new Date())} />
      <PageBody>
        <EmptyState>
          Nothing to recommend yet. The daily pipeline arrives in slice 3 — until then this page is
          the finished frame it will drop into.
        </EmptyState>
      </PageBody>
    </>
  );
}
