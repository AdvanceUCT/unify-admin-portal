import { cn } from "@/lib/cn";

const accentClassName = {
  brand: "before:bg-brand-500",
  neutral: "before:bg-border-strong",
  success: "before:bg-success-fg",
  warning: "before:bg-warning-fg",
  danger: "before:bg-danger-fg",
  info: "before:bg-info-fg",
};

/**
 * KPI tile. The tone drives an accent bar down the left edge, so a row of
 * metrics is scannable by colour before it is read.
 */
export function Metric({
  detail,
  label,
  tone = "brand",
  value,
}: {
  detail: string;
  label: string;
  tone?: keyof typeof accentClassName;
  value: number | string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-md",
        "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
        accentClassName[tone],
      )}
    >
      <p className="text-body font-medium text-fg-muted">{label}</p>
      <p className="mt-3 text-4xl font-semibold tabular-nums leading-none tracking-tight text-fg">
        {value}
      </p>
      <p className="mt-2 text-body text-fg-subtle">{detail}</p>
    </div>
  );
}
