import { NextResponse } from "next/server";

import { revokeVendorApiCredential } from "@/lib/vendors/integrations";
import { vendorFromPortalSession } from "@/lib/vendors/routeAuth";

export async function DELETE(_request: Request, context: { params: Promise<{ credentialId: string }> }) {
  const vendor = await vendorFromPortalSession();
  if (!vendor) return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  const { credentialId } = await context.params;
  await revokeVendorApiCredential(vendor.id, credentialId);
  return NextResponse.json({ revoked: true });
}
