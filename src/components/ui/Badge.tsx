/**
 * @fileoverview Provides the shared Badge UI primitive used across portal screens.
 * @module components/ui/Badge
 */

const toneClassName = {
  neutral: "border-border bg-surface-muted text-fg-muted",
  success: "border-success-border bg-success-bg text-success-fg",
  warning: "border-warning-border bg-warning-bg text-warning-fg",
  danger: "border-danger-border bg-danger-bg text-danger-fg",
  version: "border-info-border bg-info-bg text-info-fg",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof toneClassName;
}) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${toneClassName[tone]}`}>
      {children}
    </span>
  );
}
