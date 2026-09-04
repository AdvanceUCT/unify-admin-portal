/**
 * @fileoverview Handles the `/api/admin/invoices/overdue` API boundary, including its authorization and request validation.
 * @module app/api/admin/invoices/overdue/route
 */

import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { getOverdueInvoices } from "@/lib/billing/invoiceService";

/** Handles GET requests to `/api/admin/invoices/overdue`. */
export async function GET() {
  const session = await getCurrentAdminSession();
  try {
    assertCan("billing:read", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized invoices request." } }, { status });
  }

  const invoices = await getOverdueInvoices();
  const totalOverdueAmountCents = invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);

  return NextResponse.json({
    invoices,
    totalOverdueCount: invoices.length,
    totalOverdueAmountCents,
    totalOverdueAmountZar: `R ${(totalOverdueAmountCents / 100).toFixed(2)}`,
  });
}
