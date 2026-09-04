/**
 * @fileoverview Renders the shared vendor invoice table used by the overdue and all-invoices sections.
 * @module app/(admin)/billing/InvoiceTable
 */

import { StatusText } from "@/components/ui/StatusText";
import type { getAllInvoices } from "@/lib/billing/invoiceService";
import { FlagInvoiceButton } from "./FlagInvoiceButton";
import { ReinstateVendorButton } from "./ReinstateVendorButton";
import { SuspendVendorButton } from "./SuspendVendorButton";

type InvoiceRow = Awaited<ReturnType<typeof getAllInvoices>>[number];

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPeriod(periodStart: Date, periodEnd: Date) {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const startLabel = start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const endLabel = end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

function formatZar(cents: number) {
  return `R ${(cents / 100).toFixed(2)}`;
}

function daysOverdue(dueDate: Date) {
  const diffMs = Date.now() - new Date(dueDate).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function InvoiceTable({ invoices }: { invoices: InvoiceRow[] }) {
  if (invoices.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-fg-subtle">No invoices to show.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body">
        <thead className="border-b border-border">
          <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
            <th className="px-5 py-3 font-medium">Vendor</th>
            <th className="px-5 py-3 font-medium">Period</th>
            <th className="px-5 py-3 font-medium">Verifications</th>
            <th className="px-5 py-3 font-medium">Amount</th>
            <th className="px-5 py-3 font-medium">Due Date</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {invoices.map((invoice) => {
            const overdue = daysOverdue(invoice.dueDate);
            const isOverdue = invoice.status !== "PAID" && overdue > 0;
            const isSuspended = invoice.vendorProfile.suspendedForBilling;

            return (
              <tr className="transition hover:bg-surface-muted/60" key={invoice.id}>
                <td className="px-5 py-4 font-medium text-fg">{invoice.vendorName}</td>
                <td className="whitespace-nowrap px-5 py-4 text-fg-muted">
                  {formatPeriod(invoice.periodStart, invoice.periodEnd)}
                </td>
                <td className="px-5 py-4 tabular-nums text-fg-muted">{invoice.verificationCount}</td>
                <td className="whitespace-nowrap px-5 py-4 tabular-nums text-fg">
                  {formatZar(invoice.totalCents)}
                </td>
                <td className="whitespace-nowrap px-5 py-4 tabular-nums">
                  <span className="text-fg-muted">{formatDate(invoice.dueDate)}</span>
                  {isOverdue && (
                    <span className="ml-1 text-danger-fg">({overdue} days overdue)</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  {invoice.status === "PAID" ? (
                    <StatusText tone="success">Paid</StatusText>
                  ) : invoice.status === "FLAGGED" ? (
                    <StatusText tone="danger">Flagged</StatusText>
                  ) : (
                    <StatusText tone="warning">Unpaid</StatusText>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <FlagInvoiceButton
                      disabled={invoice.status === "FLAGGED"}
                      invoiceId={invoice.id}
                      vendorName={invoice.vendorName}
                    />
                    {isSuspended ? (
                      <ReinstateVendorButton vendorProfileId={invoice.vendorProfileId} />
                    ) : (
                      <SuspendVendorButton
                        disabled={isSuspended}
                        invoiceId={invoice.id}
                        vendorName={invoice.vendorName}
                        vendorProfileId={invoice.vendorProfileId}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
