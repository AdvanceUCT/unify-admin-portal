// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { withRefundRequest } from "@/lib/payments/refundRequest";
import { refundAttempt, refundStage } from "@/lib/payments/refundTrace";
import { PosApiError } from "@/lib/payments/posErrors";
import { WalletDomainError } from "@/lib/payments/errors";
const request = () => new Request("https://portal.example/refunds", { headers: { "x-request-id": "refund-correlation-1" } });
afterEach(() => vi.restoreAllMocks());

describe("safe refund request diagnostics", () => {
  it.each([
    { code: "P2028" }, { code: "P1001" }, { code: "P2024" }, { code: "P2034" },
    { code: "P2010", meta: { code: "40P01" } },
    { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "08006" } } } },
  ])("maps database failures to recoverable 503 without logging the error: %j", async error => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await withRefundRequest(request(), "portal.execute", async () => {
      refundAttempt(); refundAttempt(); refundAttempt(); refundStage("execute.resolve");
      throw { ...error, message: "token-secret SQL student-private", sql: "private SQL" };
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("x-request-id")).toBe("refund-correlation-1");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ error: { code: "REFUND_TEMPORARILY_UNAVAILABLE", requestId: "refund-correlation-1", message: expect.stringContaining("Keep the original reference") } });
    expect(log).toHaveBeenCalledWith("refund_request_failed", expect.objectContaining({ action: "portal.execute", stage: "execute.resolve", attempts: 3, category: "database_unavailable", elapsedMs: expect.any(Number) }));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/token-secret|student-private|private SQL/);
  });
  it("keeps unexpected failures at 500 with safe diagnostics", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await withRefundRequest(request(), "portal.execute", async () => { throw new Error("private database details"); });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: "INTERNAL_ERROR", requestId: "refund-correlation-1" } });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private database details");
  });
  it.each([
    new PosApiError("BRANCH_NOT_ALLOWED", "Branch unavailable", 403),
    new WalletDomainError("REFUND_AMOUNT_EXCEEDED", "Too much"),
  ])("preserves existing business errors and includes correlation", async error => {
    const response = await withRefundRequest(request(), "portal.execute", async () => { throw error; });
    expect([403, 409]).toContain(response.status);
    expect(await response.json()).toMatchObject({ error: { code: error.code, message: error.message, requestId: "refund-correlation-1" } });
  });
  it("preserves terminal-operation metadata on returned business errors", async () => {
    const response = await withRefundRequest(request(), "portal.execute", async () => Response.json({ error: { code: "REFUND_CANCELLED", message: "Cancelled" }, operation: { id: "operation-1", status: "CANCELLED" } }, { status: 409 }));
    expect(await response.json()).toMatchObject({ operation: { id: "operation-1", status: "CANCELLED" }, error: { code: "REFUND_CANCELLED", requestId: "refund-correlation-1" } });
  });
  it("keeps success fields and generates a safe ID for an invalid incoming ID", async () => {
    const response = await withRefundRequest(new Request("https://portal.example/refunds", { headers: { "x-request-id": "invalid identifier" } }), "portal.read", async () => Response.json({ status: "COMPLETED", result: { refundTransactionId: "refund-1" } }));
    expect(response.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
    expect(await response.json()).toEqual({ status: "COMPLETED", result: { refundTransactionId: "refund-1" } });
  });
  it("isolates diagnostics between concurrent requests", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await Promise.all(["one", "two"].map(id => withRefundRequest(new Request("https://portal.example/refunds", { headers: { "x-request-id": id } }), id, async () => {
      refundStage(`${id}.posting`); refundAttempt(); await new Promise(resolve => setTimeout(resolve, 5)); throw { code: "P2028" };
    })));
    expect(log.mock.calls.map(call => call[1])).toEqual(expect.arrayContaining([expect.objectContaining({ requestId: "one", stage: "one.posting", attempts: 1 }), expect.objectContaining({ requestId: "two", stage: "two.posting", attempts: 1 })]));
  });
});
