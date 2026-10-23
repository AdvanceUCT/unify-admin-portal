export const accessInput = "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm font-normal text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60";
export const accessLabel = "grid gap-1 text-sm font-medium text-fg-muted";
export const accessButton = "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60";
export const accessSecondaryButton = "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-4 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60";
export const accessCard = "overflow-hidden rounded-xl border border-border bg-surface shadow-md";
export const accessCardHeader = "flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4";

export function accessBadgeTone(summary: { approved: boolean; needsReconfirmation: boolean; application: { status: string } | null }) {
  if (summary.approved) return "success" as const;
  if (summary.needsReconfirmation || summary.application?.status === "REJECTED" || summary.application?.status === "REVOKED") return "warning" as const;
  return "neutral" as const;
}
