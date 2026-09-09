/**
 * @fileoverview Renders the authenticated administrator page at `/vendors/invoices`.
 * @module app/(admin)/vendors/invoices/page
 */

import Link from "next/link";

import { StatusText, type StatusTone } from "@/components/ui/StatusText";
import { assertCan } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { listAdminInvoiceReceivables } from "@/lib/billing/invoiceQueries";

import { generateMissingInvoicesAction } from "./actions";

const PAYMENT_TONE: Record<string, StatusTone> = {
  UNPAID: "warning",
  PAID: "success",
  NO_PAYMENT_REQUIRED: "neutral",
};

export default async function AdminVendorInvoicesPage() {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("invoice:read", session);
  assertCan("invoice:issue", session);

  const invoices = await listAdminInvoiceReceivables();
  const outstandingCount = invoices.filter((invoice) => invoice.paymentStatus === "UNPAID").length;
  const exceptionCount = invoices.filter((invoice) => invoice.hasUnresolvedException).length;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Vendor invoices (receivables)</h2>
          <div className="flex items-center gap-4">
            <p className="text-sm text-fg-muted">
              {invoices.length} invoice{invoices.length === 1 ? "" : "s"} · {outstandingCount} outstanding ·{" "}
              {exceptionCount} needing review
            </p>
            <form action={generateMissingInvoicesAction}>
              <button
                className="h-9 rounded-md border border-border px-3 text-sm font-medium text-fg hover:bg-surface-muted"
                type="submit"
              >
                Generate missing invoices
              </button>
            </form>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-body">
            <thead className="border-b border-border bg-surface-muted/60">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Issued</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((invoice) => (
                <tr className="align-middle transition hover:bg-surface-muted/60" key={invoice.id}>
                  <td className="px-4 py-3 font-medium text-fg">{invoice.vendorCompanyName}</td>
                  <td className="px-4 py-3 text-fg-muted">
                    <Link className="text-brand-600 underline hover:no-underline" href={`/vendors/invoices/${invoice.id}`}>
                      {invoice.invoiceNumber}
                    </Link>
                    {invoice.isDemo && <span className="ml-2 text-xs text-fg-subtle">(demo)</span>}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{invoice.periodLabel}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-fg">
                    {invoice.currency} {invoice.totalDisplay}
                  </td>
                  <td className="px-4 py-3">
                    <StatusText tone={PAYMENT_TONE[invoice.paymentStatus] ?? "neutral"}>
                      {invoice.paymentStatus.replaceAll("_", " ")}
                    </StatusText>
                    {invoice.hasUnresolvedException && <p className="mt-1 text-xs text-danger-fg">Needs review</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-fg-muted">
                    {invoice.issuedAtIso ? invoice.issuedAtIso.slice(0, 10) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-fg-subtle">
              No invoices have been issued yet. Run <code className="font-mono">npm run billing:invoices</code>{" "}
              once a billing period has closed.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
