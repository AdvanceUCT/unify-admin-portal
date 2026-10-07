"use client";
import { useState } from "react";
export const input = "mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg";
export const button = "inline-flex min-h-10 items-center justify-center rounded-md border border-border px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-muted disabled:opacity-50";
export const primary = `${button} bg-brand-600 text-white hover:bg-brand-700`;
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(value); setMessage("Copied"); }
    catch { setMessage("Copy failed. Select and copy the text manually."); }
  }
  return <span className="inline-flex flex-wrap items-center gap-2"><button className={button} type="button" onClick={() => void copy()} aria-label={label}>{label}</button><span className="text-xs text-fg-muted" role="status">{message}</span></span>;
}
export function CodeBlock({ code, label }: { code: string; label: string }) {
  return <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface-muted"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2"><span className="text-xs font-medium text-fg-muted">{label}</span><CopyButton value={code} label={`Copy ${label}`} /></div><pre className="max-w-full overflow-x-auto p-4 text-xs leading-relaxed text-fg" tabIndex={0} aria-label={label}><code>{code}</code></pre></div>;
}
export function Secret({ value, label, onHide }: { value: string; label: string; onHide: () => void }) {
  return <div className="space-y-2 rounded-md border border-warning-border bg-warning-bg p-4 text-warning-fg"><h3 className="font-medium">{label}</h3><p className="text-sm">Copy this to your server now. It will not be shown again.</p><code className="block select-all break-all text-sm">{value}</code><div className="flex flex-wrap gap-2"><CopyButton value={value} label={`Copy ${label.toLowerCase()}`} /><button className={button} type="button" onClick={onHide}>Hide secret</button></div></div>;
}
export function localDate(value: string | null) { return value ? new Date(value).toLocaleString() : "None recorded"; }
