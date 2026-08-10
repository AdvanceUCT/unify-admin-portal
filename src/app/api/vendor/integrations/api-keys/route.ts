/**
 * @fileoverview Handles the `/api/vendor/integrations/api-keys` API boundary, including its authorization and request validation.
 * @module app/api/vendor/integrations/api-keys/route
 */

import { NextResponse } from "next/server";

import { createVendorApiCredential, listVendorApiCredentials } from "@/lib/vendors/integrations";
import { vendorFromPortalSession } from "@/lib/vendors/routeAuth";

/** Handles GET requests to `/api/vendor/integrations/api-keys`. */
export async function GET() {
  const vendor = await vendorFromPortalSession();
  if (!vendor) return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  return NextResponse.json(await listVendorApiCredentials(vendor.id));
}

/** Handles POST requests to `/api/vendor/integrations/api-keys`. */
export async function POST(request: Request) {
  const vendor = await vendorFromPortalSession();
  if (!vendor) return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  const body = (await request.json()) as { name?: unknown };
  if (typeof body.name !== "string") {
    return NextResponse.json({ error: { message: "API key name is required." } }, { status: 400 });
  }
  return NextResponse.json(await createVendorApiCredential(vendor.id, body.name), { status: 201 });
}
