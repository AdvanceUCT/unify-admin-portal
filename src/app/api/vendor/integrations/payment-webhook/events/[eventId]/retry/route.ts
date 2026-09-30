import { NextResponse } from "next/server";
import { posErrorResponse, PosApiError } from "@/lib/payments/posErrors";
import { schedulePaymentWebhookDispatch } from "@/lib/vendors/paymentWebhookAfter";
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new PosApiError("INVALID_ORIGIN", "Same-origin access is required.", 403);
    const { vendorFromPortalSession } = await import("@/lib/vendors/routeAuth");
    const vendor = await vendorFromPortalSession();
    if (!vendor) throw new PosApiError("OWNER_REQUIRED", "Vendor owner access is required.", 403);
    const { retryPaymentWebhook } = await import("@/lib/vendors/paymentWebhooks");
    const result = await retryPaymentWebhook(vendor.id, (await context.params).eventId);
    schedulePaymentWebhookDispatch();
    return NextResponse.json({ queued: true, deliveryId: result.id });
  } catch (error) { return posErrorResponse(error); }
}
