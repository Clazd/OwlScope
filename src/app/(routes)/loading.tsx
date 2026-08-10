import { StageSpinner } from "@/components/common/StageSpinner";

/**
 * Shared loading state for every page in the (routes) group. Shown immediately
 * during route transitions while the server component renders.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[40dvh] items-center justify-center px-6 py-12">
      <StageSpinner stage="Loading" />
    </div>
  );
}
