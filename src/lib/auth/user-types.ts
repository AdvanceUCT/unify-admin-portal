/**
 * @fileoverview Distinguishes administrator accounts from vendor accounts in shared auth records.
 * @module lib/auth/user-types
 */

export const USER_TYPES = ["ADMIN", "VENDOR"] as const;

export type UserType = (typeof USER_TYPES)[number];

export function isAdminUser(userType: string | null | undefined): userType is "ADMIN" {
  return userType === "ADMIN";
}

export function isVendorUser(userType: string | null | undefined): userType is "VENDOR" {
  return userType === "VENDOR";
}
