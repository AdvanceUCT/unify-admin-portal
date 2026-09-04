/**
 * @fileoverview Idempotently provisions student, vendor, and system wallet accounts.
 * @module lib/payments/accounts
 */

import "server-only";

import { WalletAccountType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { WALLET_CURRENCY } from "@/lib/payments/constants";
import { provisionWalletSystemAccounts } from "@/lib/payments/foundation";

export {
  WALLET_CURRENCY,
  WALLET_SYSTEM_ACCOUNTS,
} from "@/lib/payments/constants";
export type { WalletSystemAccountCode } from "@/lib/payments/constants";

export async function ensureStudentWalletAccount(studentId: string) {
  const normalizedStudentId = studentId.trim();
  if (!normalizedStudentId) throw new Error("Student id is required.");

  return prisma.walletAccount.upsert({
    where: { studentId: normalizedStudentId },
    create: {
      type: WalletAccountType.STUDENT,
      currency: WALLET_CURRENCY,
      studentId: normalizedStudentId,
    },
    update: {},
    include: { balance: true },
  });
}

export async function ensureVendorWalletAccount(vendorProfileId: string) {
  const normalizedVendorProfileId = vendorProfileId.trim();
  if (!normalizedVendorProfileId) throw new Error("Vendor profile id is required.");

  return prisma.walletAccount.upsert({
    where: { vendorProfileId: normalizedVendorProfileId },
    create: {
      type: WalletAccountType.VENDOR,
      currency: WALLET_CURRENCY,
      vendorProfileId: normalizedVendorProfileId,
    },
    update: {},
    include: { balance: true },
  });
}

/** Provisions the internal counter-accounts required by balanced wallet postings. */
export async function ensureWalletSystemAccounts() {
  return prisma.$transaction((transaction) => provisionWalletSystemAccounts(transaction));
}
