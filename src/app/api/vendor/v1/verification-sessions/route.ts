import { NextResponse } from "next/server";

import { vendorFromApiRequest } from "@/lib/vendors/routeAuth";
import { createVendorCheckoutSession } from "@/lib/vendors/verifications";

export async function POST(request: Request) {
  const vendor = await vendorFromApiRequest(request);
  if (!vendor) return NextResponse.json({ error: { message: "Invalid vendor API key." } }, { status: 401 });

  try {
    const body = (await request.json()) as { checkoutId?: unknown };
    if (typeof body.checkoutId !== "string") {
      return NextResponse.json({ error: { message: "checkoutId is required." } }, { status: 400 });
    }
    return NextResponse.json(await createVendorCheckoutSession(vendor.id, body.checkoutId), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Unable to create verification session." } },
      { status: 400 },
    );
  }
}
