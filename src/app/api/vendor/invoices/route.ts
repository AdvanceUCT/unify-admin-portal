/**
 * @fileoverview Handles the `/api/vendor/invoices` API boundary, including its authorization and request validation.
 * @module app/api/vendor/invoices/route
 */

import { NextResponse } from "next/server";

import { getVendorInvoiceSummary } from "@/lib/billing/invoiceService";
import { requireApprovedVendorContext } from "@/lib/vendors/context";

/** Handles GET requests to `/api/vendor/invoices`. */
export async function GET() {
  const { context } = await requireApprovedVendorContext();

  const summary = await getVendorInvoiceSummary(context.vendorProfileId);

  return NextResponse.json({
    currentInvoice: summary.currentInvoice,
    totalPaidCents: summary.totalPaidCents,
    totalPaidZar: `R ${(summary.totalPaidCents / 100).toFixed(2)}`,
    totalUnpaidCents: summary.totalUnpaidCents,
    totalUnpaidZar: `R ${(summary.totalUnpaidCents / 100).toFixed(2)}`,
    invoiceCount: summary.invoiceCount,
    invoices: summary.allInvoices,
  });
}
