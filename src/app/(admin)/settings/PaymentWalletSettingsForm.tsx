/**
 * @fileoverview SUPER_ADMIN form for the payout threshold and overdraft suspension days.
 * @module app/(admin)/settings/PaymentWalletSettingsForm
 */

"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useState, useTransition } from "react";

import { updatePaymentWalletSettingsAction } from "./actions";

const inputClassName =
  "mt-1.5 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-surface-muted disabled:text-fg-subtle";

/** Editable by SUPER_ADMIN only (spec §3.6); other admins see the current values read only. */
export function PaymentWalletSettingsForm({
  canEdit,
  overdraftSuspensionDays,
  payoutThreshold,
}: {
  canEdit: boolean;
  overdraftSuspensionDays: number;
  payoutThreshold: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, transition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError(null);
        setSaved(false);
        transition(async () => {
          try {
            const result = await updatePaymentWalletSettingsAction(data);
            if (result.status === "error") setError(result.message);
            else setSaved(true);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Unable to save the settings.");
          }
        });
      }}
    >
      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={!canEdit || pending}>
        <label className="block text-sm">
          <span className="font-medium text-fg-muted">Payout threshold (ZAR)</span>
          <input
            className={inputClassName}
            defaultValue={payoutThreshold}
            min={0.01}
            name="payoutThreshold"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-fg-muted">Overdraft suspension (days)</span>
          <input
            className={inputClassName}
            defaultValue={overdraftSuspensionDays}
            max={365}
            min={1}
            name="overdraftSuspensionDays"
            required
            step="1"
            type="number"
          />
        </label>
      </fieldset>
      <p className="text-sm text-fg-subtle">
        Vendors are paid their full available balance once it reaches the threshold; lower it temporarily to demo
        payouts with small amounts. Suspension days apply to vendors that are already negative, measured from when
        their balance went negative.{canEdit ? null : " Only a super administrator can change these values."}
      </p>
      {error ? (
        <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg" role="status">
          Payment wallet settings saved.
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex justify-end">
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending}
            type="submit"
          >
            {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}
            {pending ? "Saving..." : "Save settings"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
