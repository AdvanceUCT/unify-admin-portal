/**
 * @fileoverview Provides the shared Status Text UI primitive used across portal screens.
 * @module components/ui/StatusText
 */

import { cn } from "@/lib/cn";

const toneClassName = {
  neutral: "text-fg-muted",
  success: "text-success-fg",
  warning: "text-warning-fg",
  danger: "text-danger-fg",
  version: "text-info-fg",
};

export type StatusTone = keyof typeof toneClassName;

/**
 * Status shown as weighted, coloured text rather than a filled pill.
 *
 * Badges are for things that are genuinely tag-like (a schema version, a
 * category). A row's status is the row's own data, so in dense tables it reads
 * better as text — a column of pills adds a lot of visual noise for no extra
 * information. Prefer this in tables; keep Badge for standalone labels.
 */
export function StatusText({
  children,
  className,
  tone = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: StatusTone;
}) {
  return (
    <span className={cn("text-body font-semibold", toneClassName[tone], className)}>
      {children}
    </span>
  );
}
