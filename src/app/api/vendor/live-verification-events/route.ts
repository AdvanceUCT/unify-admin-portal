/**
 * @fileoverview Handles the `/api/vendor/live-verification-events` API boundary that streams new rows into the verifications page.
 * @module app/api/vendor/live-verification-events/route
 */

import { NextResponse } from "next/server";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { listVendorVerificationEventsSince } from "@/lib/vendors/verifications";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function sourceParam(value: string | null) {
  return value === "qr" || value === "api" ? value : undefined;
}

/** Handles GET requests to `/api/vendor/live-verification-events`. */
export async function GET(request: Request) {
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401, headers: NO_STORE });
  }
  const context = await getApprovedVendorContextForUser(session.user.id);
  if (!context) return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403, headers: NO_STORE });

  const searchParams = new URL(request.url).searchParams;
  const cursor = searchParams.get("cursor");
  if (!cursor) {
    return NextResponse.json({ error: { message: "A live cursor is required." } }, { status: 400, headers: NO_STORE });
  }
  const branchId = searchParams.get("branchId") || undefined;
  if (branchId && !context.branchIds.includes(branchId)) {
    return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403, headers: NO_STORE });
  }

  try {
    const result = await listVendorVerificationEventsSince(
      context.vendorProfileId,
      context.branchIds,
      {
        branchId,
        dateFrom: searchParams.get("dateFrom") || undefined,
        dateTo: searchParams.get("dateTo") || undefined,
        query: searchParams.get("q") || undefined,
        source: sourceParam(searchParams.get("source")),
        university: searchParams.get("university") || undefined,
      },
      cursor,
    );
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Unable to load live verifications." } },
      { status: 400, headers: NO_STORE },
    );
  }
}
