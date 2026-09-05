/**
 * @fileoverview Handles the `/api/admin/invoices/[invoiceId]/download` API boundary, including its authorization and request validation.
 * @module app/api/admin/invoices/[invoiceId]/download/route
 */

import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { generateInvoicePdfBuffer } from "@/lib/billing/invoicePdf";
import { prisma } from "@/lib/db/prisma";

/** Handles GET requests to `/api/admin/invoices/[invoiceId]/download`. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const session = await getCurrentAdminSession();
  try {
    assertCan("billing:read", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized invoice download request." } }, { status });
  }

  const { invoiceId } = await params;
  const invoice = await prisma.vendorInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) {
    return NextResponse.json({ error: { message: "Invoice not found." } }, { status: 404 });
  }

  const pdfBuffer = await generateInvoicePdfBuffer({ ...invoice, invoiceId: invoice.id });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${invoiceId}.pdf"`,
    },
  });
}
