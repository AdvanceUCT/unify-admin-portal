/**
 * @fileoverview Reads fast wallet balance projections without scanning ledger history.
 * @module lib/payments/balance
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { WalletDomainError } from "@/lib/payments/errors";

export async function getWalletAccountBalance(accountId: string) {
  const balance = await prisma.walletAccountBalance.findUnique({
    where: { accountId },
    include: {
      account: {
        select: {
          id: true,
          status: true,
          type: true,
          currency: true,
        },
      },
    },
  });

  if (!balance) {
    throw new WalletDomainError("ACCOUNT_NOT_FOUND", "Wallet account was not found.");
  }

  return balance;
}

export async function getStudentWalletBalance(studentId: string) {
  const account = await prisma.walletAccount.findUnique({
    where: { studentId },
    select: { id: true },
  });

  if (!account) {
    throw new WalletDomainError("ACCOUNT_NOT_FOUND", "Student wallet account was not found.");
  }

  return getWalletAccountBalance(account.id);
}

