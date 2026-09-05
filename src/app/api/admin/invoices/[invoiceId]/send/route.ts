/**
 * @fileoverview Handles the `/api/admin/invoices/[invoiceId]/send` API boundary, including its authorization and request validation.
 * @module app/api/admin/invoices/[invoiceId]/send/route
 */

import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { sendInvoiceToVendor } from "@/lib/billing/invoiceService";

/** Handles POST requests to `/api/admin/invoices/[invoiceId]/send`. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const session = await getCurrentAdminSession();
  try {
    assertCan("billing:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized invoice send request." } }, { status });
  }

  const { invoiceId } = await params;

  try {
    await sendInvoiceToVendor(invoiceId, session!.user.id);
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Unable to send invoice." } },
      { status: 400 },
    );
  }

  return NextResponse.json({ sent: true });
}
