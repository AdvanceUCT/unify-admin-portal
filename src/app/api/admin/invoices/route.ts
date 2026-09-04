/**
 * @fileoverview Handles the `/api/admin/invoices` API boundary, including its authorization and request validation.
 * @module app/api/admin/invoices/route
 */

import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { getAllInvoices } from "@/lib/billing/invoiceService";

/** Handles GET requests to `/api/admin/invoices`. */
export async function GET(request: Request) {
  const session = await getCurrentAdminSession();
  try {
    assertCan("billing:read", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized invoices request." } }, { status });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;
  const vendorProfileId = searchParams.get("vendorProfileId") ?? undefined;

  const invoices = await getAllInvoices({ status, vendorProfileId });
  return NextResponse.json({ invoices });
}
