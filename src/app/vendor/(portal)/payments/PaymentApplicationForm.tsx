/**
 * @fileoverview Owns the payment-acceptance application form fields and submission feedback.
 * @module app/vendor/(portal)/payments/PaymentApplicationForm
 */

"use client";

import { useActionState } from "react";

import {
  submitVendorPaymentApplicationAction,
  type SubmitPaymentApplicationState,
} from "./actions";

const initialState: SubmitPaymentApplicationState = { status: "idle" };

export function PaymentApplicationForm() {
  const [state, formAction, isPending] = useActionState(
    submitVendorPaymentApplicationAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm">
        <span className="font-medium text-fg-muted">Why do you want to accept UNIFY wallet payments?</span>
        <textarea
          className="mt-1.5 min-h-24 w-full rounded-md border border-border px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          name="justification"
          placeholder="Optional — helps the university review your request faster."
        />
      </label>
      {state.message ? (
        <p
          aria-live="polite"
          className={
            state.status === "error"
              ? "rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"
              : "rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg"
          }
        >
          {state.message}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Submitting..." : "Apply for payment acceptance"}
        </button>
      </div>
    </form>
  );
}
