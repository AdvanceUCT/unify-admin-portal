import { NextResponse } from "next/server";
import { posErrorResponse, PosApiError } from "@/lib/payments/posErrors";
async function handle(request: Request, create: boolean) {
 try {
  const { vendorFromApiRequest } = await import("@/lib/vendors/routeAuth");
  const access = await vendorFromApiRequest(request, create ? "payments:create" : "payments:read");
  if (!access) throw new PosApiError("INVALID_API_KEY", "Invalid vendor API key.", 401);
  const service = await import("@/lib/payments/paymentRequests");
  const result = create ? await service.createPaymentRequest(access, await request.json()) : await service.listPaymentRequests(access, new URL(request.url).searchParams);
  return NextResponse.json(result, { status: create ? 201 : 200, headers: { "Cache-Control": "no-store" } });
 } catch(error) { return posErrorResponse(error); }
}
export function POST(request: Request) { return handle(request, true); }
export function GET(request: Request) { return handle(request, false); }
