import { NextResponse } from "next/server";
import { posErrorResponse, PosApiError } from "@/lib/payments/posErrors";
export async function GET(request: Request) {
  try {
    const { vendorFromPortalSession } = await import("@/lib/vendors/routeAuth");
    const vendor = await vendorFromPortalSession();
    if (!vendor) throw new PosApiError("OWNER_REQUIRED", "Vendor owner access is required.", 403);
    const { paymentWebhookHistory } = await import("@/lib/vendors/paymentWebhooks");
    return NextResponse.json(await paymentWebhookHistory(vendor.id, new URL(request.url).searchParams), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return posErrorResponse(error); }
}
