/**
 * @fileoverview Reads fail-closed payment settings from the singleton university profile.
 * @module lib/payments/config
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { WalletDomainError } from "@/lib/payments/errors";

export async function getUniversityPaymentSettings() {
  return prisma.universityProfile.findFirst({
    select: {
      id: true,
      name: true,
      abbreviation: true,
      paymentsEnabled: true,
      paymentRefundWindowSeconds: true,
      paymentSettlementDelaySeconds: true,
    },
  });
}

export async function requireEnabledUniversityPayments() {
  const settings = await getUniversityPaymentSettings();
  if (!settings?.paymentsEnabled) {
    throw new WalletDomainError("PAYMENTS_DISABLED", "Payment wallet functionality is disabled.");
  }
  return settings;
}
