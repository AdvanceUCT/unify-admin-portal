import { NextResponse } from "next/server";

import { createVendorApiCredential, listVendorApiCredentials } from "@/lib/vendors/integrations";
import { vendorFromPortalSession } from "@/lib/vendors/routeAuth";

export async function GET() {
  const vendor = await vendorFromPortalSession();
  if (!vendor) return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  return NextResponse.json(await listVendorApiCredentials(vendor.id));
}

export async function POST(request: Request) {
  const vendor = await vendorFromPortalSession();
  if (!vendor) return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  const body = (await request.json()) as { name?: unknown };
  if (typeof body.name !== "string") {
    return NextResponse.json({ error: { message: "API key name is required." } }, { status: 400 });
  }
  return NextResponse.json(await createVendorApiCredential(vendor.id, body.name), { status: 201 });
}
