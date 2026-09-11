/**
 * @fileoverview Handles the `/api/vendor/live-payments` API boundary.
 * @module app/api/vendor/live-payments/route
 */

import { NextResponse } from "next/server";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { getLivePaymentEvents } from "@/lib/vendors/livePayments";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";

/** Handles GET requests to `/api/vendor/live-payments`. */
export async function GET(request: Request) {
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }

  const context = await getApprovedVendorContextForUser(session.user.id);
  if (!context) return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });

  try {
    const searchParams = new URL(request.url).searchParams;
    const branchIds = searchParams.getAll("branchId").filter(Boolean);
    if (branchIds.some((branchId) => !context.branchIds.includes(branchId))) {
      return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });
    }

    const result = await getLivePaymentEvents(
      context,
      searchParams.get("cursor") ?? undefined,
      branchIds.length > 0 ? { branchIds } : {},
    );

    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Unable to load live payments." } },
      { status: 400, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
}
