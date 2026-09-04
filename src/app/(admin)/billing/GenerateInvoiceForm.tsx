/**
 * @fileoverview Owns the manual invoice generation form fields and submission feedback.
 * @module app/(admin)/billing/GenerateInvoiceForm
 */

"use client";

import { useFormStatus } from "react-dom";
import { FilePlus } from "lucide-react";

import { generateInvoiceAction } from "./actions";

export function GenerateInvoiceForm({
  vendors,
}: {
  vendors: { id: string; companyName: string }[];
}) {
  return (
    <details className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <summary className="cursor-pointer select-none px-5 py-4 text-section-title text-fg">
        Generate Invoice Manually
      </summary>
      <div className="border-t border-border p-5">
        <form action={generateInvoiceAction} className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-fg-muted">Vendor</span>
            <select
              className="mt-1.5 h-10 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              name="vendorProfileId"
              required
            >
              <option value="">Select a vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.companyName}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-fg-muted">Verification count</span>
            <input
              className="mt-1.5 h-10 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              min={0}
              name="verificationCount"
              required
              type="number"
            />
          </label>
          <div />
          <label className="block text-sm">
            <span className="font-medium text-fg-muted">Period start</span>
            <input
              className="mt-1.5 h-10 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              name="periodStart"
              required
              type="date"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-fg-muted">Period end</span>
            <input
              className="mt-1.5 h-10 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              name="periodEnd"
              required
              type="date"
            />
          </label>
          <div className="sm:col-span-2">
            <GenerateSubmitButton />
          </div>
        </form>
      </div>
    </details>
  );
}

function GenerateSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      <FilePlus aria-hidden className="size-4" />
      {pending ? "Generating..." : "Generate invoice"}
    </button>
  );
}
