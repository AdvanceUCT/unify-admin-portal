/**
 * @fileoverview Shared portal loading states for app-router route transitions and streamed sections.
 * @module components/layout/PortalRouteLoading
 */

function SkeletonBlock({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-surface-muted ${className}`}
    />
  );
}

export function SettingsSectionLoading({
  action = false,
  label = "Loading section",
  rows = 4,
}: {
  action?: boolean;
  label?: string;
  rows?: number;
}) {
  return (
    <div aria-label={label} aria-live="polite" role="status">
      <span className="sr-only">{label}</span>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
            key={index}
          >
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-5 w-32" />
          </div>
        ))}
      </div>
      {action ? (
        <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
          <SkeletonBlock className="h-9 w-24" />
          <SkeletonBlock className="h-4 w-36" />
        </div>
      ) : null}
    </div>
  );
}

export function PortalRouteLoading({
  label = "Loading portal page",
  sections = 3,
}: {
  label?: string;
  sections?: number;
}) {
  return (
    <div aria-label={label} aria-live="polite" className="space-y-6" role="status">
      <span className="sr-only">{label}</span>
      <div className="space-y-2">
        <SkeletonBlock className="h-4 w-56 max-w-full" />
        <SkeletonBlock className="h-4 w-80 max-w-full" />
      </div>

      {Array.from({ length: sections }).map((_, sectionIndex) => (
        <section
          aria-hidden="true"
          className="overflow-hidden rounded-xl border border-border bg-surface shadow-md"
          key={sectionIndex}
        >
          <div className="flex items-start gap-3 border-b border-border px-5 py-4">
            <SkeletonBlock className="size-9 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-5 w-44 max-w-full" />
              <SkeletonBlock className="h-4 w-96 max-w-full" />
            </div>
          </div>
          <div className="px-5 py-4">
            <SettingsSectionLoading label={`${label} section ${sectionIndex + 1}`} />
          </div>
        </section>
      ))}
    </div>
  );
}
