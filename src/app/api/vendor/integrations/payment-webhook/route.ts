import { NextResponse } from "next/server";
import { posErrorResponse, PosApiError } from "@/lib/payments/posErrors";

export async function GET() {
  try {
    const { vendorFromPortalSession } = await import("@/lib/vendors/routeAuth");
    const vendor = await vendorFromPortalSession();
    if (!vendor) throw new PosApiError("OWNER_REQUIRED", "Vendor owner access is required.", 403);
    const { getPaymentWebhookConfiguration } = await import("@/lib/vendors/paymentWebhooks");
    return NextResponse.json(await getPaymentWebhookConfiguration(vendor.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return posErrorResponse(error); }
}
export async function PUT(request: Request) { return mutate(request, false); }
export async function DELETE(request: Request) { return mutate(request, true); }
async function mutate(request: Request, disable: boolean) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new PosApiError("INVALID_ORIGIN", "Same-origin access is required.", 403);
    const { vendorFromPortalSession } = await import("@/lib/vendors/routeAuth");
    const vendor = await vendorFromPortalSession();
    if (!vendor) throw new PosApiError("OWNER_REQUIRED", "Vendor owner access is required.", 403);
    const { configurePaymentWebhook, disablePaymentWebhook } = await import("@/lib/vendors/paymentWebhooks");
    if (disable) { await disablePaymentWebhook(vendor.id); return NextResponse.json({ disabled: true }); }
    return NextResponse.json(await configurePaymentWebhook(vendor.id, await request.json()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && !(error instanceof PosApiError) && /destination|HTTPS|public addresses/.test(error.message)) return NextResponse.json({ error: { code: "UNSAFE_DESTINATION", message: "Use an HTTPS destination that resolves exclusively to public addresses." } }, { status: 400 });
    return posErrorResponse(error);
  }
}
