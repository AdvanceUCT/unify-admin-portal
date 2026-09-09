/**
 * @fileoverview Plain server-action form for `/settings/verification-billing`.
 * @module app/(admin)/settings/verification-billing/UpdateVerificationBillingPolicyForm
 */

import { updateVerificationBillingPolicyAction } from "./actions";

export function UpdateVerificationBillingPolicyForm() {
  return (
    <form action={updateVerificationBillingPolicyAction} className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="font-medium text-fg-muted">Verification fee (ZAR)</span>
        <input
          className="mt-1.5 h-10 w-full rounded-md border border-border px-3 text-sm text-fg"
          min={0}
          name="verificationFee"
          placeholder="1.25"
          required
          step="0.01"
          type="number"
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-fg-muted">Platform share (%)</span>
        <input
          className="mt-1.5 h-10 w-full rounded-md border border-border px-3 text-sm text-fg"
          max={100}
          min={0}
          name="platformPercentage"
          placeholder="10.00"
          required
          step="0.01"
          type="number"
        />
      </label>
      <div className="sm:col-span-2">
        <button className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white" type="submit">
          Save new policy
        </button>
        <p className="mt-2 text-xs text-fg-subtle">
          Effective immediately. Existing invoices and charges keep the policy that was active when they were
          created.
        </p>
      </div>
    </form>
  );
}
