import { NextResponse } from "next/server";

import { vendorFromApiRequest } from "@/lib/vendors/routeAuth";
import { getVendorVerificationResult } from "@/lib/vendors/verifications";

export async function GET(
  request: Request,
  context: { params: Promise<{ verificationRequestId: string }> },
) {
  const vendor = await vendorFromApiRequest(request);
  if (!vendor) return NextResponse.json({ error: { message: "Invalid vendor API key." } }, { status: 401 });

  const { verificationRequestId } = await context.params;
  const result = await getVendorVerificationResult(vendor.id, verificationRequestId);
  if (!result) return NextResponse.json({ error: { message: "Verification was not found." } }, { status: 404 });
  return NextResponse.json(result);
}
