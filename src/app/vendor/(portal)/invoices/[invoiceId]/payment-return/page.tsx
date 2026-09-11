/**
 * @fileoverview Renders the authenticated return page at `/vendor/invoices/[invoiceId]/payment-return`.
 * @module app/vendor/(portal)/invoices/[invoiceId]/payment-return/page
 */

import { notFound } from "next/navigation";

import { getVendorInvoiceDocument } from "@/lib/billing/invoiceQueries";
import { requireVendorInvoiceOwnerContextForRender } from "@/lib/billing/vendorAuthorization";

import { PaymentReturnStatus } from "./PaymentReturnStatus";

/**
 * The `reference` query string Paystack appends on redirect is an
 * untrusted hint only — it is never read here. Confirmation is always
 * resolved server-side against this invoice's own stored attempt.
 */
export default async function VendorInvoicePaymentReturnPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { context } = await requireVendorInvoiceOwnerContextForRender();
  const { invoiceId } = await params;
  const result = await getVendorInvoiceDocument(context.vendorProfileId, invoiceId);
  if (!result) notFound();

  return (
    <div className="mx-auto max-w-md space-y-6 py-10">
      <PaymentReturnStatus invoiceId={invoiceId} />
    </div>
  );
}
