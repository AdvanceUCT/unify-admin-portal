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
    <section className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-start gap-3 border-b border-zinc-200 px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700">
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
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
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-zinc-950">{value}</span>
    </div>
  );
}
