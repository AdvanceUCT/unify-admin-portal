/**
 * @fileoverview Handles the `/api/admin/invoices/generate` API boundary, including its authorization and request validation.
 * @module app/api/admin/invoices/generate/route
 */

import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { generateInvoiceForVendor } from "@/lib/billing/invoiceService";

/** Handles POST requests to `/api/admin/invoices/generate`. */
export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  try {
    assertCan("billing:generate", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized invoice generation request." } }, { status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { message: "Request body must be valid JSON." } }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const { vendorProfileId, vendorName, verificationCount, periodStart, periodEnd } = record;

  if (
    typeof vendorProfileId !== "string" ||
    !vendorProfileId.trim() ||
    typeof vendorName !== "string" ||
    !vendorName.trim() ||
    typeof verificationCount !== "number" ||
    !Number.isFinite(verificationCount) ||
    verificationCount < 0 ||
    typeof periodStart !== "string" ||
    typeof periodEnd !== "string"
  ) {
    return NextResponse.json(
      {
        error: {
          message:
            "vendorProfileId, vendorName, verificationCount, periodStart, and periodEnd are required.",
        },
      },
      { status: 400 },
    );
  }

  const parsedPeriodStart = new Date(periodStart);
  const parsedPeriodEnd = new Date(periodEnd);
  if (Number.isNaN(parsedPeriodStart.getTime()) || Number.isNaN(parsedPeriodEnd.getTime())) {
    return NextResponse.json({ error: { message: "periodStart and periodEnd must be valid dates." } }, { status: 400 });
  }

  try {
    const invoice = await generateInvoiceForVendor(
      vendorProfileId,
      vendorName,
      verificationCount,
      parsedPeriodStart,
      parsedPeriodEnd,
    );
    return NextResponse.json({ invoice });
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Unable to generate invoice." } },
      { status: 400 },
    );
  }
}
