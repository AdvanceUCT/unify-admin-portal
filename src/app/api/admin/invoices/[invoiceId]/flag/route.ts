/**
 * @fileoverview Handles the `/api/admin/invoices/[invoiceId]/flag` API boundary, including its authorization and request validation.
 * @module app/api/admin/invoices/[invoiceId]/flag/route
 */

import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { flagVendorInvoice } from "@/lib/billing/invoiceService";

/** Handles POST requests to `/api/admin/invoices/[invoiceId]/flag`. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const session = await getCurrentAdminSession();
  try {
    assertCan("billing:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized invoice flag request." } }, { status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Request body must be valid JSON." } }, { status: 400 });
  }

  const notes = body && typeof body === "object" ? (body as Record<string, unknown>).notes : undefined;
  if (typeof notes !== "string" || !notes.trim()) {
    return NextResponse.json({ error: { message: "Notes are required to flag an invoice." } }, { status: 400 });
  }

  const { invoiceId } = await params;

  try {
    await flagVendorInvoice(invoiceId, session!.user.id, notes);
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Unable to flag invoice." } },
      { status: 400 },
    );
  }

  return NextResponse.json({ flagged: true });
}
