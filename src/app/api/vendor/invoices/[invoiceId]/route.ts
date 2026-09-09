/**
 * @fileoverview Handles the `/api/vendor/invoices/[invoiceId]` API boundary, including its authorization and request validation.
 * @module app/api/vendor/invoices/[invoiceId]/route
 */

import { NextResponse } from "next/server";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { getVendorInvoiceOwnerContext } from "@/lib/billing/vendorAuthorization";
import { getVendorInvoiceDocument } from "@/lib/billing/invoiceQueries";

/** Handles GET requests to `/api/vendor/invoices/[invoiceId]`. Owner-scoped; never another vendor's data. */
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

  return NextResponse.json(result);
}
