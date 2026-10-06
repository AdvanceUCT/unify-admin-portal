import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ refundAccess: vi.fn(), refundJson: vi.fn() }));
const operations = vi.hoisted(() => ({ legacyRefundOperation: vi.fn() }));
vi.mock("@/lib/vendors/refundOperationRoutes", () => auth);
vi.mock("@/lib/vendors/refundOperations", () => operations);
import { NextResponse } from "next/server";
import { PosApiError } from "@/lib/payments/posErrors";
import { POST } from "@/app/api/vendor/payments/[transactionId]/refund/route";
const context = { params: Promise.resolve({ transactionId: "spend-1" }) };
const request = (body: unknown) => new Request("http://localhost/api/vendor/payments/spend-1/refund", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); auth.refundAccess.mockResolvedValue({ vendorProfileId: "vendor-1", actor: { userId: "owner-1" } }); auth.refundJson.mockImplementation((body, status = 200) => NextResponse.json(body, { status })); });
describe("portal compatibility refund route", () => {
 it("authenticates before refund registration", async () => { auth.refundAccess.mockRejectedValue(new PosApiError("UNAUTHORIZED", "Sign in.", 401)); expect((await POST(request({}), context)).status).toBe(401); expect(operations.legacyRefundOperation).not.toHaveBeenCalled(); });
 it("validates frozen instructions", async () => { expect((await POST(request({ amountMinor: 0, idempotencyKey: "" }), context)).status).toBe(400); expect(operations.legacyRefundOperation).not.toHaveBeenCalled(); });
 it("preserves the success result and includes operation metadata", async () => { operations.legacyRefundOperation.mockResolvedValue({ id: "op-1", status: "COMPLETED", result: { originalTransactionId: "spend-1", refundTransactionId: "refund-1" } }); const response = await POST(request({ amountMinor: 400, idempotencyKey: "key-1" }), context); expect(await response.json()).toMatchObject({ refundTransactionId: "refund-1", operation: { id: "op-1" } }); });
 it("returns the durable rejected outcome with its prior status", async () => { operations.legacyRefundOperation.mockResolvedValue({ id: "op-1", status: "REJECTED", rejection: { code: "VENDOR_PAYMENT_SUSPENDED", status: 403, message: "Suspended." } }); const response = await POST(request({ amountMinor: 400, idempotencyKey: "key-1" }), context); expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ error: { code: "VENDOR_PAYMENT_SUSPENDED" }, operation: { status: "REJECTED" } }); });
});
