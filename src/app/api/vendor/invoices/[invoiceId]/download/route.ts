/**
 * @fileoverview Handles the `/api/vendor/invoices/[invoiceId]/download` API boundary, including its authorization and request validation.
 * @module app/api/vendor/invoices/[invoiceId]/download/route
 */

import { NextResponse } from "next/server";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { getVendorInvoiceOwnerContext } from "@/lib/billing/vendorAuthorization";
import { getVendorInvoiceDocument } from "@/lib/billing/invoiceQueries";
import { renderInvoicePdf } from "@/lib/billing/invoicePdf";

/** Handles GET requests to `/api/vendor/invoices/[invoiceId]/download`. Owner-scoped PDF, never cached. */
export async function GET(_request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }
  const owner = await getVendorInvoiceOwnerContext(session.user.id);
  if (!owner) return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });

  const { invoiceId } = await context.params;
  const result = await getVendorInvoiceDocument(owner.vendorProfileId, invoiceId);
  if (!result) return NextResponse.json({ error: { message: "Invoice was not found." } }, { status: 404 });

  const pdf = await renderInvoicePdf(result.document);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${result.document.invoiceNumber}.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}
