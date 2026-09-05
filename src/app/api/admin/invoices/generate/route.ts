/**
 * @fileoverview Handles the `/api/admin/invoices/generate` API boundary, including its authorization and request validation.
 * @module app/api/admin/invoices/generate/route
 */

import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { generateMonthlyInvoicesForVendors } from "@/lib/billing/invoiceService";

/**
 * Handles POST requests to `/api/admin/invoices/generate`.
 * Manually triggers the same automated, verification-count-driven invoice
 * generation the monthly cron job runs — useful for backfills or testing.
 * Takes no body: there is nothing for an admin to enter, since the
 * verification count and rate are always computed, never typed in.
 */
export async function POST() {
  const session = await getCurrentAdminSession();
  try {
    assertCan("billing:generate", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized invoice generation request." } }, { status });
  }

  try {
    const result = await generateMonthlyInvoicesForVendors();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Unable to generate invoices." } },
      { status: 400 },
    );
  }
}
