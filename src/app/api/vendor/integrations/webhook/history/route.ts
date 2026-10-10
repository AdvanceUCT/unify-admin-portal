import { NextResponse } from "next/server";
import { PosApiError, posErrorResponse } from "@/lib/payments/posErrors";
import { vendorFromPortalSession } from "@/lib/vendors/routeAuth";
import { verificationWebhookHistory } from "@/lib/vendors/verificationWebhookHistory";

export async function GET(request: Request) {
  try {
    const vendor = await vendorFromPortalSession();
    if (!vendor) throw new PosApiError("OWNER_REQUIRED", "Vendor owner access is required.", 403);
    return NextResponse.json(await verificationWebhookHistory(vendor.id, new URL(request.url).searchParams), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return posErrorResponse(error); }
}
