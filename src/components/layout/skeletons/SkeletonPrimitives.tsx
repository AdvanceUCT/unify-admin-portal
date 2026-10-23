/** Shared, data-free shapes composed by each route's loading boundary. */
import type { ReactNode } from "react";

export function SkeletonBlock({
  className = "h-4 w-full",
}: {
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`block max-w-full rounded-md bg-surface-muted motion-safe:animate-pulse ${className}`}
    />
  );
}

export function SkeletonPage({
  label,
  children,
  className = "space-y-6",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="min-w-0"
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className={className}>
        {children}
      </div>
    </div>
  );
}

export function SkeletonHeading({
  description = true,
}: {
  description?: boolean;
}) {
  return (
    <div className="space-y-2">
      <SkeletonBlock className="h-8 w-72" />
      {description && <SkeletonBlock className="h-4 w-96" />}
    </div>
  );
}

export function SkeletonAction({
  align = "right",
}: {
  align?: "left" | "right";
}) {
  return (
    <div
      className={`flex ${align === "right" ? "justify-end" : "justify-start"}`}
    >
      <SkeletonBlock className="h-10 w-40" />
    </div>
  );
}

export function SkeletonBack() {
  return <SkeletonBlock className="h-9 w-40" />;
}

export function SkeletonTabs({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-4 overflow-hidden border-b border-border pb-3">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={i} className="h-8 w-32 shrink-0" />
      ))}
    </div>
  );
}

export function SkeletonCard({
  children,
  header = true,
  description = false,
  icon = false,
}: {
  children?: ReactNode;
  header?: boolean;
  description?: boolean;
  icon?: boolean;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      {header && (
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          {icon && <SkeletonBlock className="size-9 shrink-0" />}
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-5 w-44" />
            {description && <SkeletonBlock className="h-4 w-96" />}
          </div>
        </div>
      )}
      {children && <div className="space-y-4 px-5 py-4">{children}</div>}
    </section>
  );
}

export function SkeletonFields({
  count = 4,
  columns = 2,
}: {
  count?: number;
  columns?: 1 | 2 | 3;
}) {
  const grid =
    columns === 3 ? "lg:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "";
  return (
    <div className={`grid gap-4 ${grid}`}>
      {Array.from({ length: count }, (_, i) => (
        <div className="min-w-0 space-y-1.5" key={i}>
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonFacts({ count = 4 }: { count?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: count }, (_, i) => (
        <div className="flex items-center justify-between gap-4 py-2" key={i}>
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-5 w-36" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonMetrics({
  vendor = false,
  count = 4,
}: {
  vendor?: boolean;
  count?: 2 | 4;
}) {
  const grid =
    count === 2
      ? "md:grid-cols-2"
      : `sm:grid-cols-2 ${vendor ? "lg:grid-cols-4" : "xl:grid-cols-4"}`;
  return (
    <div className={`grid gap-4 ${grid}`}>
      {Array.from({ length: count }, (_, i) => (
        <div
          className="space-y-3 rounded-xl border border-border bg-surface p-5 shadow-md"
          key={i}
        >
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-9 w-20" />
          <SkeletonBlock className="h-4 w-28" />
        </div>
      ))}
    </div>
  );
}

/** Fixed column widths reserve the table layout without requiring real records. */
export function SkeletonTable({
  columns = 4,
  rows = 5,
  header = true,
  pagination = false,
  framed = true,
  minWidth,
}: {
  columns?: number;
  rows?: number;
  header?: boolean;
  pagination?: boolean;
  framed?: boolean;
  minWidth?: string;
}) {
  return (
    <section
      className={
        framed
          ? "min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-md"
          : "min-w-0"
      }
    >
      {header && (
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <SkeletonBlock className="h-5 w-44" />
          <SkeletonBlock className="h-4 w-24" />
        </div>
      )}
      <div className="overflow-x-auto">
        <div
          style={{ minWidth: minWidth ?? (columns > 4 ? "48rem" : undefined) }}
        >
          {Array.from({ length: rows + 1 }, (_, row) => (
            <div
              key={row}
              className={`grid gap-5 border-b border-border px-5 ${row === 0 ? "py-3" : "py-4"}`}
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: columns }, (_, col) => (
                <div className="space-y-2" key={col}>
                  <SkeletonBlock
                    className={`${row === 0 ? "h-3 w-20" : "h-4 w-28"}`}
                  />
                  {row > 0 && col === 0 && (
                    <SkeletonBlock className="h-3 w-20" />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {pagination && (
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <SkeletonBlock className="h-9 w-24" />
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-9 w-24" />
        </div>
      )}
    </section>
  );
}

export function SkeletonList({
  rows = 3,
  avatar = false,
}: {
  rows?: number;
  avatar?: boolean;
}) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <div className="flex items-start gap-4 py-4" key={i}>
          {avatar && (
            <SkeletonBlock className="size-12 shrink-0 rounded-full" />
          )}
          <div className="min-w-0 flex-1 space-y-3">
            <SkeletonBlock className="h-5 w-48" />
            <SkeletonBlock className="h-4 w-72" />
            <SkeletonBlock className="h-4 w-40" />
          </div>
          <SkeletonBlock className="h-9 w-24 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonQr() {
  return (
    <SkeletonCard header={false}>
      <div className="flex flex-col items-center gap-4 py-4">
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="aspect-square w-48" />
        <SkeletonBlock className="h-4 w-56" />
        <SkeletonBlock className="h-10 w-36" />
      </div>
    </SkeletonCard>
  );
}
