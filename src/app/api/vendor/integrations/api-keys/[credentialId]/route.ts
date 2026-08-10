/**
 * @fileoverview Handles the `/api/vendor/integrations/api-keys/[credentialId]` API boundary, including its authorization and request validation.
 * @module app/api/vendor/integrations/api-keys/[credentialId]/route
 */

import { NextResponse } from "next/server";

import { revokeVendorApiCredential } from "@/lib/vendors/integrations";
import { vendorFromPortalSession } from "@/lib/vendors/routeAuth";

/** Handles DELETE requests to `/api/vendor/integrations/api-keys/[credentialId]`. */
export async function DELETE(_request: Request, context: { params: Promise<{ credentialId: string }> }) {
  const vendor = await vendorFromPortalSession();
  if (!vendor) return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  const { credentialId } = await context.params;
  await revokeVendorApiCredential(vendor.id, credentialId);
  return NextResponse.json({ revoked: true });
}
