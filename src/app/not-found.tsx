import Link from "next/link";

/**
 * Custom 404 page. Uses the existing design tokens and layout primitives so it
 * feels like part of the product rather than a framework default.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 py-12">
      <div className="reading-column space-y-6 text-center">
        <p className="type-micro text-ink-3">404</p>
        <h1 className="type-h1 text-ink">Page not found</h1>
        <p className="type-body text-ink-2">
          There is nothing at this address. If you followed a link inside the
          app, that is a bug worth reporting.
        </p>
        <div className="pt-4">
          <Link
            href="/today"
            className="inline-block rounded-control border border-rule-strong bg-surface px-4 py-2 type-body-strong text-ink transition-colors hover:bg-surface-sunken"
            style={{ transitionDuration: "var(--dur-state)" }}
          >
            Go to Today
          </Link>
        </div>
      </div>
    </div>
  );
}
