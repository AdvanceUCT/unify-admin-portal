import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getCurrentVendorSession: vi.fn() }));
const context = vi.hoisted(() => ({ getApprovedVendorContextForUser: vi.fn() }));
const branchOnboarding = vi.hoisted(() => ({ listActivePaymentBranchIdsForContext: vi.fn() }));
const refunds = vi.hoisted(() => ({ refundSpend: vi.fn() }));

vi.mock("@/lib/auth/session", () => auth);
vi.mock("@/lib/vendors/context", () => context);
vi.mock("@/lib/payments/branchOnboarding", () => branchOnboarding);
vi.mock("@/lib/vendors/refunds", () => refunds);

import { POST } from "@/app/api/vendor/payments/[transactionId]/refund/route";

function refundRequest(body: unknown) {
  return new Request("http://localhost:3000/api/vendor/payments/spend-1/refund", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("vendor refund route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getCurrentVendorSession.mockResolvedValue({
      user: { id: "user-1", userType: "VENDOR" },
    });
    context.getApprovedVendorContextForUser.mockResolvedValue({
      userId: "user-1",
      vendorProfileId: "vendor-1",
      companyName: "Cafe",
      role: "OWNER",
      branchIds: ["branch-1"],
    });
    branchOnboarding.listActivePaymentBranchIdsForContext.mockResolvedValue(["branch-1"]);
    refunds.refundSpend.mockResolvedValue({
      originalTransactionId: "spend-1",
      refundTransactionId: "refund-1",
      refundedAmountMinor: 400,
      totalRefundedMinor: 400,
      remainingRefundableMinor: 600,
      refundStatus: "PARTIALLY_REFUNDED",
    });
  });

  it("rejects unauthenticated requests", async () => {
    auth.getCurrentVendorSession.mockResolvedValue(null);

    const response = await POST(refundRequest({ amountMinor: 400, idempotencyKey: "refund-1" }), {
      params: Promise.resolve({ transactionId: "spend-1" }),
    });

    expect(response.status).toBe(401);
    expect(refunds.refundSpend).not.toHaveBeenCalled();
  });

  it("rejects vendors without an approved context", async () => {
    context.getApprovedVendorContextForUser.mockResolvedValue(null);

    const response = await POST(refundRequest({ amountMinor: 400, idempotencyKey: "refund-1" }), {
      params: Promise.resolve({ transactionId: "spend-1" }),
    });

    expect(response.status).toBe(403);
    expect(refunds.refundSpend).not.toHaveBeenCalled();
  });

  it("validates refund request shape", async () => {
    const response = await POST(refundRequest({ amountMinor: 0, idempotencyKey: "" }), {
      params: Promise.resolve({ transactionId: "spend-1" }),
    });

    expect(response.status).toBe(400);
    expect(refunds.refundSpend).not.toHaveBeenCalled();
  });

  it("creates a scoped vendor refund", async () => {
    const response = await POST(refundRequest({ amountMinor: 400, idempotencyKey: "refund-1" }), {
      params: Promise.resolve({ transactionId: "spend-1" }),
    });

    expect(response.status).toBe(200);
    expect(refunds.refundSpend).toHaveBeenCalledWith({
      vendorProfileId: "vendor-1",
      allowedBranchIds: ["branch-1"],
      target: { transactionId: "spend-1" },
      amountMinor: 400,
      idempotencyKey: "refund-1",
      actor: { userId: "user-1" },
    });
    await expect(response.json()).resolves.toEqual({
      originalTransactionId: "spend-1",
      refundTransactionId: "refund-1",
      refundedAmountMinor: 400,
      totalRefundedMinor: 400,
      remainingRefundableMinor: 600,
      refundStatus: "PARTIALLY_REFUNDED",
    });
  });

  it("maps a suspended vendor to 403", async () => {
    const { WalletDomainError } = await import("@/lib/payments/errors");
    refunds.refundSpend.mockRejectedValue(new WalletDomainError("VENDOR_PAYMENT_SUSPENDED", "Suspended."));
    const response = await POST(refundRequest({ amountMinor: 400, idempotencyKey: "refund-1" }), {
      params: Promise.resolve({ transactionId: "spend-1" }),
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VENDOR_PAYMENT_SUSPENDED" } });
  });
});
