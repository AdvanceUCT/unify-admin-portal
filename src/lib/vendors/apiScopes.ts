export const VENDOR_API_SCOPES = [
  "verification:create", "verification:read", "payments:create", "payments:read", "payments:cancel", "refunds:create",
] as const;
export type VendorApiScope = typeof VENDOR_API_SCOPES[number];
export const LEGACY_VERIFICATION_SCOPES: VendorApiScope[] = ["verification:create", "verification:read"];

export function validateCredentialPermissions(scopes: unknown, branchIds: unknown) {
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.some((scope) => !VENDOR_API_SCOPES.includes(scope))) {
    throw new Error("Select at least one valid API scope.");
  }
  if (!Array.isArray(branchIds) || branchIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new Error("Branch selection is invalid.");
  }
  if (scopes.some((scope: string) => scope.startsWith("payments:") || scope.startsWith("refunds:")) && branchIds.length === 0) {
    throw new Error("Payment and refund keys need an explicit branch selection.");
  }
  return { scopes: [...new Set(scopes)] as VendorApiScope[], branchIds: [...new Set(branchIds)] as string[] };
}
