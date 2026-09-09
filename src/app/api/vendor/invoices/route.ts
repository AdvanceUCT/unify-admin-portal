/**
 * @fileoverview Handles the `/api/vendor/invoices` API boundary, including its authorization and request validation.
 * @module app/api/vendor/invoices/route
 */

import { NextResponse } from "next/server";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { getVendorInvoiceOwnerContext } from "@/lib/billing/vendorAuthorization";
import { listVendorInvoices } from "@/lib/billing/invoiceQueries";

/** Handles GET requests to `/api/vendor/invoices`. Active owners only — staff have no invoice access. */
export async function GET() {
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }
  const owner = await getVendorInvoiceOwnerContext(session.user.id);
  if (!owner) return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });

  const invoices = await listVendorInvoices(owner.vendorProfileId);
  return NextResponse.json({ invoices });
}
