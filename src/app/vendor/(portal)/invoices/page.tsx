/**
 * @fileoverview Renders the approved vendor owner page at `/vendor/invoices`.
 * @module app/vendor/(portal)/invoices/page
 */

import Link from "next/link";

import { StatusText, type StatusTone } from "@/components/ui/StatusText";
import { listVendorInvoices } from "@/lib/billing/invoiceQueries";
import { requireVendorInvoiceOwnerContext } from "@/lib/billing/vendorAuthorization";

const PAYMENT_TONE: Record<string, StatusTone> = {
  UNPAID: "warning",
  PAID: "success",
  NO_PAYMENT_REQUIRED: "neutral",
};

export default async function VendorInvoicesPage() {
  const { context } = await requireVendorInvoiceOwnerContext();
  const invoices = await listVendorInvoices(context.vendorProfileId);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Invoices</h2>
          <p className="text-sm text-fg-muted">
            {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-body">
            <thead className="border-b border-border bg-surface-muted/60">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((invoice) => (
                <tr className="align-middle transition hover:bg-surface-muted/60" key={invoice.id}>
                  <td className="px-4 py-3 font-medium text-fg">
                    {invoice.invoiceNumber}
                    {invoice.isDemo && (
                      <span className="ml-2 text-xs font-normal text-fg-subtle">
                        Demo invoice — no real payment required
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{invoice.periodLabel}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-fg">
                    {invoice.currency} {invoice.totalDisplay}
                  </td>
                  <td className="px-4 py-3">
                    <StatusText tone={PAYMENT_TONE[invoice.paymentStatus] ?? "neutral"}>
                      {invoice.paymentStatus.replaceAll("_", " ")}
                    </StatusText>
                    {invoice.hasUnresolvedException && (
                      <p className="mt-1 text-xs text-danger-fg">Needs review</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      className="text-sm font-medium text-fg-muted hover:text-fg"
                      href={`/vendor/invoices/${invoice.id}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-fg-subtle">
              No invoices yet. Invoices are issued automatically after each billing month closes.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
