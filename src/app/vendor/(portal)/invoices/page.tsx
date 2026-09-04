/**
 * @fileoverview Renders the approved vendor page at `/vendor/invoices`.
 * @module app/vendor/(portal)/invoices/page
 */

import { Metric } from "@/components/ui/Metric";
import { StatusText } from "@/components/ui/StatusText";
import { VendorInvoicePayButton } from "@/features/vendors/VendorInvoicePayButton";
import { getVendorInvoiceSummary } from "@/lib/billing/invoiceService";
import { requireApprovedVendorContext } from "@/lib/vendors/context";

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPeriod(start: Date, end: Date): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const startLabel = startDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const endLabel = endDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

function formatCents(cents: number): string {
  return `R ${(cents / 100).toFixed(2)}`;
}

function getDaysOverdue(dueDate: Date): number {
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24));
}

const PAYMENT_BANNER = {
  success: {
    className: "border-success-border bg-success-bg text-success-fg",
    message: "Payment received. Thank you — your invoice has been marked paid.",
  },
  failed: {
    className: "border-danger-border bg-danger-bg text-danger-fg",
    message: "Payment was not completed. You can try again below.",
  },
  error: {
    className: "border-danger-border bg-danger-bg text-danger-fg",
    message: "Something went wrong confirming your payment. If you were charged, contact support.",
  },
} as const;

export default async function VendorInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { payment } = await searchParams;
  const paymentResult = payment && payment in PAYMENT_BANNER ? (payment as keyof typeof PAYMENT_BANNER) : undefined;

  const { context } = await requireApprovedVendorContext();
  const summary = await getVendorInvoiceSummary(context.vendorProfileId);
  const { currentInvoice } = summary;
  const isOverdue = Boolean(currentInvoice && getDaysOverdue(currentInvoice.dueDate) > 0);

  return (
    <div className="space-y-6">
      {paymentResult && (
        <p className={`rounded-md border px-4 py-3 text-sm ${PAYMENT_BANNER[paymentResult].className}`}>
          {PAYMENT_BANNER[paymentResult].message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          detail={currentInvoice ? "Please settle before the due date" : "Nothing due right now"}
          label="Amount due"
          tone={currentInvoice ? (isOverdue ? "danger" : "warning") : "neutral"}
          value={currentInvoice ? formatCents(currentInvoice.totalCents) : "R 0.00"}
        />
        <Metric
          detail="Lifetime payments to UCT"
          label="Total paid"
          tone="success"
          value={formatCents(summary.totalPaidCents)}
        />
        <Metric
          detail={`${summary.invoiceCount} invoice${summary.invoiceCount === 1 ? "" : "s"} total`}
          label="Invoice history"
          tone="brand"
          value={summary.invoiceCount}
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Current Invoice</h2>
        </div>
        <div className="p-5">
          {!currentInvoice ? (
            <p className="text-sm text-success-fg">You&apos;re all caught up — no outstanding invoices.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Billing period</p>
                  <p className="mt-1 text-sm text-fg">
                    {formatPeriod(currentInvoice.periodStart, currentInvoice.periodEnd)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Verifications</p>
                  <p className="mt-1 text-sm text-fg">
                    {currentInvoice.verificationCount} × {formatCents(currentInvoice.ratePerVerification)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Due date</p>
                  <p className="mt-1 text-sm text-fg">
                    {formatDate(currentInvoice.dueDate)}
                    {isOverdue && (
                      <span className="ml-1 text-danger-fg">
                        ({getDaysOverdue(currentInvoice.dueDate)} days overdue)
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Status</p>
                  <p className="mt-1">
                    <StatusText tone={currentInvoice.status === "FLAGGED" ? "danger" : "warning"}>
                      {currentInvoice.status === "FLAGGED" ? "Flagged" : "Unpaid"}
                    </StatusText>
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-4 sm:max-w-xs">
                <VendorInvoicePayButton
                  invoiceId={currentInvoice.id}
                  isOverdue={isOverdue}
                  totalCents={currentInvoice.totalCents}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Invoice History</h2>
        </div>
        {summary.allInvoices.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-fg-subtle">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body">
              <thead className="border-b border-border">
                <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                  <th className="px-5 py-3 font-medium">Period</th>
                  <th className="px-5 py-3 font-medium">Verifications</th>
                  <th className="px-5 py-3 font-medium">Amount</th>
                  <th className="px-5 py-3 font-medium">Due Date</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summary.allInvoices.map((invoice) => (
                  <tr className="transition hover:bg-surface-muted/60" key={invoice.id}>
                    <td className="whitespace-nowrap px-5 py-4 text-fg-muted">
                      {formatPeriod(invoice.periodStart, invoice.periodEnd)}
                    </td>
                    <td className="px-5 py-4 tabular-nums text-fg-muted">{invoice.verificationCount}</td>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums text-fg">
                      {formatCents(invoice.totalCents)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums text-fg-muted">
                      {formatDate(invoice.dueDate)}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
