/**
 * @fileoverview SUPER_ADMIN form for the days a vendor has to pay an invoice before verification is suspended.
 * @module app/(admin)/settings/verification-billing/InvoicePaymentWindowForm
 */

"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useState, useTransition } from "react";

import { INVOICE_PAYMENT_DUE_DAYS_MAX } from "@/lib/billing/constants";
import { updateInvoicePaymentWindowAction } from "./actions";

const inputClassName =
  "mt-1.5 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-surface-muted disabled:text-fg-subtle";

/** Editable by SUPER_ADMIN only; other admins see the current value read only. */
export function InvoicePaymentWindowForm({ canEdit, invoicePaymentDueDays }: { canEdit: boolean; invoicePaymentDueDays: number }) {
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
            const result = await updateInvoicePaymentWindowAction(data);
            if (result.status === "error") setError(result.message);
            else setSaved(true);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Unable to save the payment window.");
          }
        });
      }}
    >
      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={!canEdit || pending}>
        <label className="block text-sm">
          <span className="font-medium text-fg-muted">Payment window (days)</span>
          <input
            className={inputClassName}
            defaultValue={invoicePaymentDueDays}
            max={INVOICE_PAYMENT_DUE_DAYS_MAX}
            min={1}
            name="invoicePaymentDueDays"
            required
            step="1"
            type="number"
          />
        </label>
      </fieldset>
      <p className="text-sm text-fg-subtle">
        Counted from the day an invoice is issued. If it is still unpaid afterwards, the vendor can no longer start
        verifications until every overdue invoice is paid. Changes apply to invoices issued from now on.
        {canEdit ? null : " Only a super administrator can change this value."}
      </p>
      {error ? (
        <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg" role="status">
          Payment window saved.
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
            {pending ? "Saving..." : "Save payment window"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
