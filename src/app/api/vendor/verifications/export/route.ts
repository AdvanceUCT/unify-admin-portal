/**
 * @fileoverview Handles the `/api/vendor/verifications/export` API boundary, including its authorization and request validation.
 * @module app/api/vendor/verifications/export/route
 */

import { NextResponse } from "next/server";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { exportVendorVerificationEventsCsv, type VendorVerificationEventFilters } from "@/lib/vendors/verifications";

function optionalParam(searchParams: URLSearchParams, name: string) {
  const value = searchParams.get(name)?.trim();
  return value || undefined;
}

function exportFilename() {
  return `verification-events-${new Date().toISOString().slice(0, 10)}.csv`;
}

/** Handles GET requests to `/api/vendor/verifications/export`. */
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

  const filters: VendorVerificationEventFilters = {
    branchId,
    dateFrom: optionalParam(searchParams, "dateFrom"),
    dateTo: optionalParam(searchParams, "dateTo"),
    query: optionalParam(searchParams, "q"),
    university: optionalParam(searchParams, "university"),
  };
  const csv = await exportVendorVerificationEventsCsv(context.vendorProfileId, context.branchIds, filters);

  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${exportFilename()}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
