/**
 * @fileoverview Authenticates vendor API requests and resolves their permitted branch scope.
 * @module lib/vendors/routeAuth
 */

import "server-only";

import type { VendorApiScope } from "@/lib/vendors/apiScopes";
import { getApprovedVendorContextForUser } from "@/lib/vendors/context";
import { getCurrentVendorSession } from "@/lib/auth/session";
import { approvedVendorProfileForUser, authenticateVendorApiKey } from "@/lib/vendors/integrations";

export async function vendorFromPortalSession() {
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") return null;
  const context = await getApprovedVendorContextForUser(session.user.id);
  if (!context || context.role !== "OWNER") return null;
  return approvedVendorProfileForUser(session.user.id);
}

export function vendorFromApiRequest(request: Request, scope?: VendorApiScope) {
  return authenticateVendorApiKey(request.headers.get("authorization"), scope);
}
