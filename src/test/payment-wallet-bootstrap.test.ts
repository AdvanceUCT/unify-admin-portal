import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  WalletAccountStatus,
  WalletAccountType,
} from "@/generated/prisma/enums";
import { WALLET_SYSTEM_ACCOUNTS } from "@/lib/payments/constants";
import {
  bootstrapPaymentWalletFoundation,
  type PaymentWalletFoundationClient,
} from "@/lib/payments/foundation";

const university = {
  id: "university-1",
  name: "Example University",
  abbreviation: "EU",
  paymentWalletEnabled: false,
};

const database = {
  universityProfile: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  walletAccount: {
    upsert: vi.fn(),
  },
};

const client = database as unknown as PaymentWalletFoundationClient;

beforeEach(() => {
  vi.clearAllMocks();
  database.universityProfile.findMany.mockResolvedValue([university]);
  database.universityProfile.update.mockResolvedValue({
    ...university,
    paymentWalletEnabled: true,
  });
  database.walletAccount.upsert.mockImplementation(async ({ create }) => ({
    id: `account-${create.systemCode}`,
    type: WalletAccountType.SYSTEM,
    status: WalletAccountStatus.ACTIVE,
    currency: create.currency,
    systemCode: create.systemCode,
    balance: {
      postedBalanceMinor: BigInt(0),
      version: BigInt(0),
    },
  }));
});

describe("payment wallet foundation bootstrap", () => {
  it("requires exactly one existing university profile", async () => {
    database.universityProfile.findMany.mockResolvedValueOnce([]);

    await expect(bootstrapPaymentWalletFoundation(client)).rejects.toThrow(
      "Complete the university setup wizard",
    );
    expect(database.walletAccount.upsert).not.toHaveBeenCalled();

    database.universityProfile.findMany.mockResolvedValueOnce([
      university,
      { ...university, id: "university-2" },
    ]);

    await expect(bootstrapPaymentWalletFoundation(client)).rejects.toThrow(
      "requires exactly one profile",
    );
  });

  it("idempotently provisions only the two clearing accounts", async () => {
    const result = await bootstrapPaymentWalletFoundation(client);

    expect(result.systemAccounts.map((account) => account.systemCode)).toEqual(
      WALLET_SYSTEM_ACCOUNTS,
    );
    expect(database.walletAccount.upsert).toHaveBeenCalledTimes(2);
    expect(database.universityProfile.update).not.toHaveBeenCalled();
    expect(result.university.paymentWalletEnabled).toBe(false);
  });

  it("enables the payment wallet only when development enablement is explicitly requested", async () => {
    const result = await bootstrapPaymentWalletFoundation(client, {
      enablePaymentWalletForDevelopment: true,
    });

    expect(database.universityProfile.update).toHaveBeenCalledWith({
      where: { id: university.id },
      data: { paymentWalletEnabled: true },
      select: {
        id: true,
        name: true,
        abbreviation: true,
        paymentWalletEnabled: true,
      },
    });
    expect(result.university.paymentWalletEnabled).toBe(true);
  });

  it("rolls back through the caller when a balance projection is missing", async () => {
    database.walletAccount.upsert.mockResolvedValueOnce({
      id: "account-without-balance",
      type: WalletAccountType.SYSTEM,
      status: WalletAccountStatus.ACTIVE,
      currency: "ZAR",
      systemCode: WALLET_SYSTEM_ACCOUNTS[0],
      balance: null,
    });

    await expect(bootstrapPaymentWalletFoundation(client)).rejects.toThrow(
      "failed integrity verification",
    );
  });
});
