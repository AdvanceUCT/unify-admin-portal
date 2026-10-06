import { beforeEach, describe, expect, it, vi } from "vitest";

import { LedgerDirection, WalletAccountType, WalletTransactionStatus, WalletTransactionType } from "@/generated/prisma/enums";

const tx = vi.hoisted(() => ({
  paymentRequest: { findFirst: vi.fn() },
  walletTransaction: { findFirst: vi.fn(), aggregate: vi.fn() },
  walletAccountBalance: { findUniqueOrThrow: vi.fn() },
}));
const database = vi.hoisted(() => ({
  vendorProfile: { findUnique: vi.fn() },
  universityProfile: { findFirst: vi.fn() },
}));
const posting = vi.hoisted(() => ({
  postRefundInTransaction: vi.fn(),
  runSerializableTransaction: vi.fn(),
}));
const email = vi.hoisted(() => ({ sendVendorOverdraftStartedEmail: vi.fn() }));
const webhooks = vi.hoisted(() => ({ schedulePaymentWebhookDispatch: vi.fn() }));
const afterTasks = vi.hoisted(() => [] as Array<() => Promise<void>>);

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => afterTasks.push(task) }));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/payments/posting", () => posting);
vi.mock("@/lib/email/vendor-wallet", () => email);
vi.mock("@/lib/vendors/paymentWebhookAfter", () => webhooks);
vi.mock("@/lib/payments/posErrors", () => ({
  PosApiError: class PosApiError extends Error {
    constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
  },
}));

import { refundSpend } from "@/lib/vendors/refunds";

const spend = {
  id: "spend-1",
  type: WalletTransactionType.SPEND,
  status: WalletTransactionStatus.COMPLETED,
  amountMinor: BigInt(5_000),
  reference: "lunch",
  entries: [{
    accountId: "vendor-account-1",
    direction: LedgerDirection.CREDIT,
    account: { type: WalletAccountType.VENDOR, vendorProfileId: "vendor-1" },
  }],
  paymentRequest: { id: "request-1" },
};
const createdRefund = {
  id: "refund-1",
  amountMinor: BigInt(3_500),
  initiatedByUserId: "user-1",
  completedAt: new Date("2026-10-06T12:00:00.000Z"),
  createdAt: new Date("2026-10-06T12:00:00.000Z"),
};
const portalInput = {
  vendorProfileId: "vendor-1",
  allowedBranchIds: ["branch-1"],
  target: { transactionId: "spend-1" },
  amountMinor: 3_500,
  idempotencyKey: "refund-key-1",
  actor: { userId: "user-1" },
};

function balances(before: number, after: number) {
  tx.walletAccountBalance.findUniqueOrThrow
    .mockResolvedValueOnce({ postedBalanceMinor: BigInt(before) })
    .mockResolvedValueOnce({ postedBalanceMinor: BigInt(after) });
}

beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.length = 0;
  posting.runSerializableTransaction.mockImplementation(async (operation) => operation(tx));
  tx.walletTransaction.findFirst.mockImplementation(async ({ where }) => ("idempotencyKey" in where ? null : spend));
  tx.walletTransaction.aggregate.mockResolvedValue({ _sum: { amountMinor: BigInt(3_500) } });
  posting.postRefundInTransaction.mockResolvedValue(createdRefund);
  database.vendorProfile.findUnique.mockResolvedValue({
    companyName: "Campus Cafe",
    contactEmail: "owner@example.invalid",
    contactPersonName: "Owner",
    walletAccount: { balance: { postedBalanceMinor: BigInt(-1_500), negativeSince: new Date("2026-10-06T12:00:00.000Z") } },
  });
  database.universityProfile.findFirst.mockResolvedValue({ paymentWalletOverdraftSuspensionDays: 14 });
});

describe("refundSpend", () => {
  it("refunds without a time window, returns a negative balance and emails only when overdraft starts", async () => {
    balances(2_000, -1_500);
    const result = await refundSpend(portalInput);

    expect(posting.postRefundInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      originalTransactionId: "spend-1",
      amountMinor: BigInt(3_500),
      initiatedByUserId: "user-1",
    }));
    expect(result).toMatchObject({
      paymentRequestId: "request-1",
      totalRefundedMinor: 3_500,
      remainingRefundableMinor: 1_500,
      refundStatus: "PARTIALLY_REFUNDED",
      vendorBalanceMinor: -1_500,
      replayed: false,
      refund: { id: "refund-1", source: "PORTAL", amountMinor: 3_500 },
    });
    expect(webhooks.schedulePaymentWebhookDispatch).toHaveBeenCalled();
    await Promise.all(afterTasks.map((task) => task()));
    expect(email.sendVendorOverdraftStartedEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "owner@example.invalid",
      deficitMinor: 1_500,
      suspendAt: new Date("2026-10-20T12:00:00.000Z"),
    }));

    // Already negative: the deficit deepens but no second day-0 email is scheduled.
    afterTasks.length = 0;
    balances(-1_500, -2_000);
    await refundSpend({ ...portalInput, idempotencyKey: "refund-key-2" });
    expect(afterTasks).toHaveLength(0);
  });

  it("replays the original refund and rejects a reused key with different terms", async () => {
    tx.walletTransaction.findFirst.mockImplementation(async ({ where }) => (
      "idempotencyKey" in where
        ? { ...createdRefund, linkedTransactionId: "spend-1", status: WalletTransactionStatus.COMPLETED }
        : spend
    ));
    balances(1_500, 1_500);
    await expect(refundSpend(portalInput)).resolves.toMatchObject({ refundTransactionId: "refund-1", replayed: true });
    expect(posting.postRefundInTransaction).not.toHaveBeenCalled();

    await expect(refundSpend({ ...portalInput, amountMinor: 1_000 })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("rejects spends outside the caller's branches or vendor", async () => {
    tx.walletTransaction.findFirst.mockResolvedValue(null);
    await expect(refundSpend(portalInput)).rejects.toMatchObject({ code: "PAYMENT_NOT_REFUNDABLE" });
  });

  it("resolves API refunds only from the vendor's own paid payment requests", async () => {
    const apiInput = { ...portalInput, target: { paymentRequestId: "request-1" }, actor: { apiCredentialId: "credential-1" } };

    tx.paymentRequest.findFirst.mockResolvedValueOnce(null);
    await expect(refundSpend(apiInput)).rejects.toMatchObject({ code: "REQUEST_NOT_FOUND", status: 404 });

    tx.paymentRequest.findFirst.mockResolvedValueOnce({ vendorBranchId: "branch-2", status: "PAID", walletTransactionId: "spend-1" });
    await expect(refundSpend(apiInput)).rejects.toMatchObject({ code: "BRANCH_NOT_ALLOWED", status: 403 });

    tx.paymentRequest.findFirst.mockResolvedValueOnce({ vendorBranchId: "branch-1", status: "CANCELLED", walletTransactionId: null });
    await expect(refundSpend(apiInput)).rejects.toMatchObject({ code: "REQUEST_NOT_PAID", status: 409 });

    tx.paymentRequest.findFirst.mockResolvedValueOnce({ vendorBranchId: "branch-1", status: "PAID", walletTransactionId: "spend-1" });
    posting.postRefundInTransaction.mockResolvedValueOnce({ ...createdRefund, initiatedByUserId: null });
    balances(5_000, 1_500);
    await expect(refundSpend(apiInput)).resolves.toMatchObject({ refund: { source: "API" } });
    expect(posting.postRefundInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ initiatedByUserId: undefined }));
  });
});
