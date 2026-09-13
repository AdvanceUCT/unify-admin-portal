/**
 * @fileoverview Handles the `/api/vendor/payments/export` API boundary.
 * @module app/api/vendor/payments/export/route
 */

import { NextResponse } from "next/server";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { exportVendorPaymentEventsCsv, type VendorPaymentEventFilters } from "@/lib/vendors/livePayments";

function optionalParam(searchParams: URLSearchParams, name: string) {
  const value = searchParams.get(name)?.trim();
  return value || undefined;
}

function refundStatusParam(searchParams: URLSearchParams): VendorPaymentEventFilters["refundStatus"] {
  const status = optionalParam(searchParams, "refundStatus");
  return status === "REFUNDABLE" || status === "EXPIRED" || status === "FULLY_REFUNDED"
    ? status
    : undefined;
}

function exportFilename() {
  return `wallet-payments-${new Date().toISOString().slice(0, 10)}.csv`;
}

/** Handles GET requests to `/api/vendor/payments/export`. */
export async function GET(request: Request) {
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }
  const context = await getApprovedVendorContextForUser(session.user.id);
  if (!context) return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });

  const searchParams = new URL(request.url).searchParams;
  const branchId = optionalParam(searchParams, "branchId");
  if (branchId && !context.branchIds.includes(branchId)) {
    return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });
  }

  const filters: VendorPaymentEventFilters = {
    branchId,
    dateFrom: optionalParam(searchParams, "dateFrom"),
    dateTo: optionalParam(searchParams, "dateTo"),
    query: optionalParam(searchParams, "q"),
    refundStatus: refundStatusParam(searchParams),
  };
  const csv = await exportVendorPaymentEventsCsv(context, filters);

  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${exportFilename()}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
