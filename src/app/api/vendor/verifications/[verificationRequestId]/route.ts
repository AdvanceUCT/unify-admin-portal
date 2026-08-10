/**
 * @fileoverview Handles the `/api/vendor/verifications/[verificationRequestId]` API boundary, including its authorization and request validation.
 * @module app/api/vendor/verifications/[verificationRequestId]/route
 */

import { NextResponse } from "next/server";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { getVendorVerificationResult } from "@/lib/vendors/verifications";

/** Handles GET requests to `/api/vendor/verifications/[verificationRequestId]`. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ verificationRequestId: string }> },
) {
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  const vendor = await getApprovedVendorContextForUser(session.user.id);
  if (!vendor) return NextResponse.json({ error: { message: "Forbidden." } }, { status: 403 });
  const { verificationRequestId } = await context.params;
  const result = await getVendorVerificationResult(vendor.vendorProfileId, verificationRequestId, vendor.branchIds);
  if (!result) return NextResponse.json({ error: { message: "Verification was not found." } }, { status: 404 });
  return NextResponse.json(result);
}
