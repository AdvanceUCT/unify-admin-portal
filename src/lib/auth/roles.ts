/**
 * @fileoverview Declares the administrator roles accepted by the portal.
 * @module lib/auth/roles
 */

export const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "ISSUER",
  "VIEWER",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const INVITABLE_ADMIN_ROLES = ["ADMIN", "ISSUER", "VIEWER"] as const;

export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Admin",
  ISSUER: "Issuer",
  VIEWER: "Viewer",
};
