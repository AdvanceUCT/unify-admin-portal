"use client";

import { useState, useTransition } from "react";

import { getRenewalSettingsPreviewAction, saveRenewalSettingsAction } from "./actions";

export function RenewalSettingsForm({
  enabled,
  cadenceMonths,
  validityDays,
}: {
  enabled: boolean;
  cadenceMonths: number;
  validityDays: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const nextEnabled = formData.get("automaticCredentialRenewalEnabled") === "on";
    const nextCadence = Number(formData.get("renewalCadenceMonths"));
    if (nextEnabled) {
      const due = await getRenewalSettingsPreviewAction(nextCadence);
      if (due > 0 && !window.confirm(`${due} credential${due === 1 ? " is" : "s are"} immediately due under this cadence. Save and queue them on the next run?`)) return;
    }
    startTransition(async () => {
      try {
        await saveRenewalSettingsAction(formData);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Unable to save renewal settings.");
      }
    });
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
      <label className="block text-sm">
        <span className="font-medium text-fg-muted">Default validity days</span>
        <input className="mt-1.5 h-10 w-full rounded-md border border-border px-3 text-sm text-fg" defaultValue={validityDays} max={3650} min={1} name="defaultCredentialValidityDays" type="number" />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-fg-muted">Renewal cadence months</span>
        <input className="mt-1.5 h-10 w-full rounded-md border border-border px-3 text-sm text-fg" defaultValue={cadenceMonths} max={120} min={1} name="renewalCadenceMonths" type="number" />
      </label>
      <label className="flex items-center gap-3 text-sm sm:col-span-2">
        <input defaultChecked={enabled} name="automaticCredentialRenewalEnabled" type="checkbox" />
        <span><span className="font-medium text-fg">Automatically renew credentials</span><span className="block text-fg-subtle">Send students a replacement activation offer when their cadence is due.</span></span>
      </label>
      {error ? <p className="text-sm text-danger-fg sm:col-span-2">{error}</p> : null}
      <div className="sm:col-span-2">
        <button className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50" disabled={isPending} type="submit">{isPending ? "Saving..." : "Save settings"}</button>
      </div>
    </form>
  );
}
