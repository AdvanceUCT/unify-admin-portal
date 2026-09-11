import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getCurrentVendorSession: vi.fn() }));
const context = vi.hoisted(() => ({ getApprovedVendorContextForUser: vi.fn() }));
const refunds = vi.hoisted(() => ({ createVendorPaymentRefund: vi.fn() }));

vi.mock("@/lib/auth/session", () => auth);
vi.mock("@/lib/vendors/context", () => context);
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
    refunds.createVendorPaymentRefund.mockResolvedValue({
      originalTransactionId: "spend-1",
      refundTransactionId: "refund-1",
      refundedAmountMinor: 400,
      totalRefundedMinor: 400,
      remainingRefundableMinor: 600,
      refundStatus: "REFUNDABLE",
    });
  });

  it("rejects unauthenticated requests", async () => {
    auth.getCurrentVendorSession.mockResolvedValue(null);

    const response = await POST(refundRequest({ amountMinor: 400, idempotencyKey: "refund-1" }), {
      params: Promise.resolve({ transactionId: "spend-1" }),
    });

    expect(response.status).toBe(401);
    expect(refunds.createVendorPaymentRefund).not.toHaveBeenCalled();
  });

  it("rejects vendors without an approved context", async () => {
    context.getApprovedVendorContextForUser.mockResolvedValue(null);

    const response = await POST(refundRequest({ amountMinor: 400, idempotencyKey: "refund-1" }), {
      params: Promise.resolve({ transactionId: "spend-1" }),
    });

    expect(response.status).toBe(403);
    expect(refunds.createVendorPaymentRefund).not.toHaveBeenCalled();
  });

  it("validates refund request shape", async () => {
    const response = await POST(refundRequest({ amountMinor: 0, idempotencyKey: "" }), {
      params: Promise.resolve({ transactionId: "spend-1" }),
    });

    expect(response.status).toBe(400);
    expect(refunds.createVendorPaymentRefund).not.toHaveBeenCalled();
  });

  it("creates a scoped vendor refund", async () => {
    const response = await POST(refundRequest({ amountMinor: 400, idempotencyKey: "refund-1" }), {
      params: Promise.resolve({ transactionId: "spend-1" }),
    });

    expect(response.status).toBe(200);
    expect(refunds.createVendorPaymentRefund).toHaveBeenCalledWith({
      context: expect.objectContaining({ vendorProfileId: "vendor-1" }),
      transactionId: "spend-1",
      amountMinor: 400,
      idempotencyKey: "refund-1",
    });
    await expect(response.json()).resolves.toEqual({
      originalTransactionId: "spend-1",
      refundTransactionId: "refund-1",
      refundedAmountMinor: 400,
      totalRefundedMinor: 400,
      remainingRefundableMinor: 600,
      refundStatus: "REFUNDABLE",
    });
  });
});
