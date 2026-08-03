import { NextResponse } from "next/server";

import { vendorFromPortalSession } from "@/lib/vendors/routeAuth";
import { getVendorVerificationResult } from "@/lib/vendors/verifications";

export async function GET(
  _request: Request,
  context: { params: Promise<{ verificationRequestId: string }> },
) {
  const vendor = await vendorFromPortalSession();
  if (!vendor) return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  const { verificationRequestId } = await context.params;
  const result = await getVendorVerificationResult(vendor.id, verificationRequestId);
  if (!result) return NextResponse.json({ error: { message: "Verification was not found." } }, { status: 404 });
  return NextResponse.json(result);
}
