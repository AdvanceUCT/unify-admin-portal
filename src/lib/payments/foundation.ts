/**
 * @fileoverview Transaction-scoped provisioning for the payment wallet foundation.
 * @module lib/payments/foundation
 */

import type { Prisma } from "@/generated/prisma/client";
import {
  WalletAccountStatus,
  WalletAccountType,
} from "@/generated/prisma/enums";
import {
  WALLET_CURRENCY,
  WALLET_SYSTEM_ACCOUNTS,
} from "@/lib/payments/constants";

export type PaymentWalletFoundationClient = Pick<
  Prisma.TransactionClient,
  "universityProfile" | "walletAccount"
>;

type BootstrapPaymentWalletFoundationOptions = {
  enablePaymentsForDevelopment?: boolean;
};

export async function provisionWalletSystemAccounts(
  database: Pick<PaymentWalletFoundationClient, "walletAccount">,
) {
  const accounts = [];

  for (const systemCode of WALLET_SYSTEM_ACCOUNTS) {
    const account = await database.walletAccount.upsert({
      where: { systemCode },
      create: {
        type: WalletAccountType.SYSTEM,
        currency: WALLET_CURRENCY,
        systemCode,
      },
      update: {},
      select: {
        id: true,
        type: true,
        status: true,
        currency: true,
        systemCode: true,
        balance: {
          select: {
            postedBalanceMinor: true,
            version: true,
          },
        },
      },
    });

    if (
      account.type !== WalletAccountType.SYSTEM ||
      account.status !== WalletAccountStatus.ACTIVE ||
      account.currency !== WALLET_CURRENCY ||
      account.systemCode !== systemCode ||
      !account.balance
    ) {
      throw new Error(`Wallet system account ${systemCode} failed integrity verification.`);
    }

    accounts.push(account);
  }

  return accounts;
}

export async function bootstrapPaymentWalletFoundation(
  database: PaymentWalletFoundationClient,
  options: BootstrapPaymentWalletFoundationOptions = {},
) {
  const profiles = await database.universityProfile.findMany({
    orderBy: { createdAt: "asc" },
    take: 2,
    select: {
      id: true,
      name: true,
      abbreviation: true,
      paymentsEnabled: true,
    },
  });

  if (profiles.length === 0) {
    throw new Error(
      "No university profile exists. Complete the university setup wizard before bootstrapping payments.",
    );
  }

  if (profiles.length > 1) {
    throw new Error(
      "Multiple university profiles exist. Payment bootstrap requires exactly one profile per deployment.",
    );
  }

  let university = profiles[0];
  if (options.enablePaymentsForDevelopment && !university.paymentsEnabled) {
    university = await database.universityProfile.update({
      where: { id: university.id },
      data: { paymentsEnabled: true },
      select: {
        id: true,
        name: true,
        abbreviation: true,
        paymentsEnabled: true,
      },
    });
  }

  const systemAccounts = await provisionWalletSystemAccounts(database);

  return { university, systemAccounts };
}
