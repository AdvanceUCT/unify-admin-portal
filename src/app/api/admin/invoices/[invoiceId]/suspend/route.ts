/**
 * @fileoverview Handles the `/api/admin/invoices/[invoiceId]/suspend` API boundary, including its authorization and request validation.
 * @module app/api/admin/invoices/[invoiceId]/suspend/route
 */

import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { suspendVendorForBilling } from "@/lib/billing/invoiceService";
import { prisma } from "@/lib/db/prisma";

/** Handles POST requests to `/api/admin/invoices/[invoiceId]/suspend`. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const session = await getCurrentAdminSession();
  try {
    assertCan("billing:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized invoice suspend request." } }, { status });
  }

  const { invoiceId } = await params;

  const invoice = await prisma.vendorInvoice.findUnique({
    where: { id: invoiceId },
    select: { vendorProfileId: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: { message: "Invoice not found." } }, { status: 404 });
  }

  try {
    await suspendVendorForBilling(invoice.vendorProfileId, session!.user.id, invoiceId);
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Unable to suspend vendor." } },
      { status: 400 },
    );
  }

  return NextResponse.json({ suspended: true });
}
