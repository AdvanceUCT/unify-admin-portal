import "server-only";

import { getCurrentVendorSession } from "@/lib/auth/session";
import { approvedVendorProfileForUser, authenticateVendorApiKey } from "@/lib/vendors/integrations";

export async function vendorFromPortalSession() {
  const session = await getCurrentVendorSession();
  if (!session || session.user.userType !== "VENDOR") return null;
  return approvedVendorProfileForUser(session.user.id);
}

export function vendorFromApiRequest(request: Request) {
  return authenticateVendorApiKey(request.headers.get("authorization"));
}
