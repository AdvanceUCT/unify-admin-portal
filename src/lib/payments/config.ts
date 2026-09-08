/**
 * @fileoverview Reads fail-closed payment-wallet settings from the singleton university profile.
 * @module lib/payments/config
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { WalletDomainError } from "@/lib/payments/errors";

export async function getUniversityPaymentWalletSettings() {
  return prisma.universityProfile.findFirst({
    select: {
      id: true,
      name: true,
      abbreviation: true,
      paymentWalletEnabled: true,
      paymentWalletRefundWindowSeconds: true,
      paymentWalletSettlementDelaySeconds: true,
    },
  });
}

export async function requireEnabledUniversityPaymentWallet() {
  const settings = await getUniversityPaymentWalletSettings();
  if (!settings?.paymentWalletEnabled) {
    throw new WalletDomainError("PAYMENT_WALLET_DISABLED", "Payment wallet functionality is disabled.");
  }
  return settings;
}
