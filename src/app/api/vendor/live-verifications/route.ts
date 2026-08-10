/**
 * @fileoverview Handles the `/api/vendor/live-verifications` API boundary, including its authorization and request validation.
 * @module app/api/vendor/live-verifications/route
 */

import { NextResponse } from "next/server";

import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { getLiveVerificationEvents } from "@/lib/vendors/liveVerifications";
import { getCurrentVendorSession } from "@/lib/auth/session";

/** Handles GET requests to `/api/vendor/live-verifications`. */
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
    const result = await getLiveVerificationEvents(
      context,
      searchParams.get("cursor") ?? undefined,
      branchIds.length > 0 ? { branchIds } : {},
    );
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Unable to load live verifications." } },
      { status: 400, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }
}
