/**
 * @fileoverview Renders the approved vendor owner page at `/vendor/invoices/[invoiceId]`.
 * @module app/vendor/(portal)/invoices/[invoiceId]/page
 */

import { notFound } from "next/navigation";

import { BackButton } from "@/components/ui/BackButton";
import { StatusText, type StatusTone } from "@/components/ui/StatusText";
import { env } from "@/lib/config/env";
import { getVendorInvoiceDocument } from "@/lib/billing/invoiceQueries";
import { requireVendorInvoiceOwnerContext } from "@/lib/billing/vendorAuthorization";

import { PayInvoiceButton } from "./PayInvoiceButton";

const PAYMENT_TONE: Record<string, StatusTone> = {
  UNPAID: "warning",
  PAID: "success",
  NO_PAYMENT_REQUIRED: "neutral",
};

export default async function VendorInvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { context } = await requireVendorInvoiceOwnerContext();
  const { invoiceId } = await params;
  const result = await getVendorInvoiceDocument(context.vendorProfileId, invoiceId);
  if (!result) notFound();

  const { document, paymentStatus, hasUnresolvedException, isPayable } = result;
  const canCheckout = isPayable && env.VERIFICATION_INVOICE_CHECKOUT_ENABLED;

  return (
    <div className="space-y-6">
      <BackButton href="/vendor/invoices" label="Back to invoices" />
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-section-title text-fg">Invoice {document.invoiceNumber}</h2>
            <p className="text-sm text-fg-muted">{document.periodLabel}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusText tone={PAYMENT_TONE[paymentStatus] ?? "neutral"}>
              {paymentStatus.replaceAll("_", " ")}
            </StatusText>
            <a
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-muted"
              href={`/api/vendor/invoices/${invoiceId}/download`}
            >
              Download PDF
            </a>
            {canCheckout && <PayInvoiceButton invoiceId={invoiceId} />}
          </div>
        </div>

        {hasUnresolvedException && (
          <div className="border-b border-border bg-danger-fg/10 px-5 py-3 text-sm text-danger-fg">
            This invoice has an unresolved billing exception under review.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 border-b border-border px-5 py-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-caption uppercase tracking-wide text-fg-subtle">Issued by</p>
            <p className="font-medium text-fg">{document.issuer.name}</p>
            {document.issuer.contactEmail && <p className="text-fg-muted">{document.issuer.contactEmail}</p>}
          </div>
          <div>
            <p className="text-caption uppercase tracking-wide text-fg-subtle">Billed to</p>
            <p className="font-medium text-fg">{document.customer.companyName}</p>
            {document.customer.contactEmail && <p className="text-fg-muted">{document.customer.contactEmail}</p>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-body">
            <thead className="border-b border-border bg-surface-muted/60">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Service period</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Unit price</th>
                <th className="px-4 py-3 font-medium">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {document.items.map((item, index) => (
                <tr className="align-middle" key={index}>
                  <td className="px-4 py-3 font-medium text-fg">{item.branchName}</td>
                  <td className="px-4 py-3 text-fg-muted">{item.servicePeriodLabel}</td>
                  <td className="px-4 py-3 text-fg-muted">{item.quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-fg-muted">
                    {document.currency} {item.unitPriceDisplay}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-fg">
                    {document.currency} {item.lineTotalDisplay}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-1 border-t border-border px-5 py-4 text-right text-sm">
          <p className="text-base font-semibold text-fg">
            Total: {document.currency} {document.totalDisplay}
          </p>
        </div>
      </section>
    </div>
  );
}
