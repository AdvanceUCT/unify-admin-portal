/**
 * @fileoverview Owns the verification rate input, save state, and feedback for `/settings`.
 * @module features/settings/BillingRateForm
 */

"use client";

import { useState } from "react";

import { updateVerificationRateAction } from "@/app/(admin)/settings/actions";

export function BillingRateForm({ currentRateZar }: { currentRateZar: number }) {
  const [rate, setRate] = useState(currentRateZar.toFixed(2));
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedRate = Number.parseFloat(rate);
  const isRateValid = Number.isFinite(parsedRate) && parsedRate > 0 && parsedRate <= 1000;

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    const result = await updateVerificationRateAction(parsedRate);

    setIsSaving(false);
    if (result.ok) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError(result.error ?? "Failed to save");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-4xl font-semibold tabular-nums leading-none tracking-tight text-fg">
          R {currentRateZar.toFixed(2)}
        </p>
        <p className="mt-1.5 text-sm font-medium text-fg-muted">per verification</p>
        <p className="mt-1 text-sm text-fg-subtle">
          Charged to vendors monthly based on their verification usage.
        </p>
      </div>

      <div className="border-t border-border pt-5">
        <label className="block text-sm" htmlFor="verification-rate">
          <span className="font-medium text-fg-muted">New rate per verification (R)</span>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              className="h-10 w-40 rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              id="verification-rate"
              max="1000"
              min="0.01"
              onChange={(event) => setRate(event.target.value)}
              placeholder="5.00"
              step="0.01"
              type="number"
              value={rate}
            />
            <button
              className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving || !isRateValid}
              onClick={handleSave}
              type="button"
            >
              {isSaving ? "Saving..." : "Save rate"}
            </button>
          </div>
        </label>

        {success && (
          <p className="mt-3 rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg">
            Rate updated successfully. New invoices will use R{rate} per verification.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        )}
      </div>

      <div className="rounded-md border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg">
        Changing the rate only affects future invoices. All existing invoices keep the rate that
        was in effect when they were generated.
      </div>
    </div>
  );
}
