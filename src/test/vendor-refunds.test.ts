import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  LedgerDirection,
  WalletAccountType,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@/generated/prisma/enums";

const database = vi.hoisted(() => ({ walletTransaction: { findFirst: vi.fn() } }));
const posting = vi.hoisted(() => ({ postRefund: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/payments/posting", () => posting);

import { createVendorPaymentRefund } from "@/lib/vendors/refunds";

const context = {
  userId: "vendor-user-1",
  vendorProfileId: "vendor-1",
  companyName: "Campus Cafe",
  role: "OWNER" as const,
  branchIds: ["branch-1"],
};

type MockRefund = {
  id: string;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  amountMinor: bigint;
};

type MockOriginalSpend = {
  id: string;
  type: WalletTransactionType;
  status: WalletTransactionStatus;
  amountMinor: bigint;
  reference: string;
  refundableUntil: Date;
  entries: Array<{
    accountId: string;
    direction: LedgerDirection;
    account: { type: WalletAccountType };
  }>;
  linkedTransactions: MockRefund[];
};

const originalSpend: MockOriginalSpend = {
  id: "spend-1",
  type: WalletTransactionType.SPEND,
  status: WalletTransactionStatus.COMPLETED,
  amountMinor: BigInt(1_000),
  reference: "lunch",
  refundableUntil: new Date("2999-09-11T08:20:00.000Z"),
  entries: [
    {
      accountId: "student-account-1",
      direction: LedgerDirection.DEBIT,
      account: { type: WalletAccountType.STUDENT },
    },
    {
      accountId: "vendor-account-1",
      direction: LedgerDirection.CREDIT,
      account: { type: WalletAccountType.VENDOR },
    },
  ],
  linkedTransactions: [],
};

function mockOriginalSpend(overrides: Partial<MockOriginalSpend> = {}) {
  const spend = { ...originalSpend, ...overrides };
  database.walletTransaction.findFirst.mockImplementation(async (query) => (
    "id" in query.where ? spend : null
  ));
}

describe("vendor refunds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOriginalSpend();
    posting.postRefund.mockResolvedValue({
      id: "refund-1",
      amountMinor: BigInt(400),
    });
  });

  it("posts an internal refund for a scoped vendor payment", async () => {
    const result = await createVendorPaymentRefund({
      context,
      transactionId: "spend-1",
      amountMinor: 400,
      idempotencyKey: "refund-request-1",
    });

    expect(posting.postRefund).toHaveBeenCalledWith({
      originalTransactionId: "spend-1",
      amountMinor: BigInt(400),
      idempotencyKey: "refund-request-1",
      initiatedByUserId: "vendor-user-1",
      reference: "Refund for lunch",
    });
    expect(result).toMatchObject({
      originalTransactionId: "spend-1",
      refundTransactionId: "refund-1",
      refundedAmountMinor: 400,
      totalRefundedMinor: 400,
      remainingRefundableMinor: 600,
      refundStatus: "REFUNDABLE",
    });
  });

  it("rejects refunds that exceed the remaining refundable amount", async () => {
    mockOriginalSpend({
      linkedTransactions: [
        { id: "refund-existing", type: WalletTransactionType.REFUND, status: WalletTransactionStatus.COMPLETED, amountMinor: BigInt(800) },
      ],
    });

    await expect(createVendorPaymentRefund({
      context,
      transactionId: "spend-1",
      amountMinor: 300,
      idempotencyKey: "refund-request-2",
    })).rejects.toMatchObject({
      code: "INVALID_POSTING",
      message: "Refund amount exceeds the remaining refundable amount.",
    });
    expect(posting.postRefund).not.toHaveBeenCalled();
  });

  it("returns an existing refund for an idempotent retry", async () => {
    database.walletTransaction.findFirst.mockImplementation(async (query) => (
      "id" in query.where
        ? originalSpend
        : {
            id: "refund-existing",
            type: WalletTransactionType.REFUND,
            status: WalletTransactionStatus.COMPLETED,
            amountMinor: BigInt(400),
            linkedTransactionId: "spend-1",
          }
    ));

    const result = await createVendorPaymentRefund({
      context,
      transactionId: "spend-1",
      amountMinor: 400,
      idempotencyKey: "refund-request-1",
    });

    expect(posting.postRefund).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      refundTransactionId: "refund-existing",
      refundedAmountMinor: 400,
      remainingRefundableMinor: 600,
    });
  });
});
