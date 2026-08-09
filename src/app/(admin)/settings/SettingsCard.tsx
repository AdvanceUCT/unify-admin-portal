import type { LucideIcon } from "lucide-react";

export function SettingsCard({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700">
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-section-title text-fg">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-fg-subtle">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function SettingsField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0">
      <span className="text-fg-subtle">{label}</span>
      <span className="font-medium text-fg">{value}</span>
    </div>
  );
}
