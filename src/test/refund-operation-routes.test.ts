// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ session: vi.fn(), context: vi.fn(), credential: vi.fn(), pending: vi.fn(), register: vi.fn(), operation: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentVendorSession: mocks.session }));
vi.mock("@/lib/vendors/context", () => ({ getApprovedVendorContextForUser: mocks.context }));
vi.mock("@/lib/vendors/integrations", () => ({ authenticateVendorApiKey: mocks.credential }));
vi.mock("@/lib/vendors/refundOperations", () => ({ getPendingRefundOperation: mocks.pending, registerRefundOperation: mocks.register, refundOperation: mocks.operation }));
vi.mock("@/lib/billing/paymentRouteGuards", () => ({ isSameOriginRequest: () => true }));
import { refundOperationCollection, refundOperationItem } from "@/lib/vendors/refundOperationRoutes";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "owner", userType: "VENDOR" } });
  mocks.context.mockResolvedValue({ userId: "owner", vendorProfileId: "vendor" });
  mocks.credential.mockResolvedValue({ id: "vendor", credentialId: "api-key" });
});
afterEach(() => vi.restoreAllMocks());
const request = (method = "GET", body?: object) => new Request("https://portal.example/api/vendor/refund-operations", { method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });

describe.each([false, true])("refund operation routes, API=%s", api => {
  it("discovers pending work without executing or registering", async () => {
    mocks.pending.mockResolvedValue({ operation: { id: "pending" } });
    const response = await refundOperationCollection(request(), api);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.operation).not.toHaveBeenCalled(); expect(mocks.register).not.toHaveBeenCalled();
  });
  it("registers frozen terms under the authenticated operator", async () => {
    mocks.register.mockResolvedValue({ id: "op", status: "PENDING" });
    const body = { [api ? "paymentRequestId" : "transactionId"]: "sale", amountMinor: 1500, idempotencyKey: "original-key" };
    const response = await refundOperationCollection(request("POST", body), api);
    expect(response.status).toBe(200);
    expect(mocks.register).toHaveBeenCalledWith({ vendorProfileId: "vendor", actor: api ? { apiCredentialId: "api-key" } : { userId: "owner" } }, { target: api ? { paymentRequestId: "sale" } : { transactionId: "sale" }, amountMinor: 1500, idempotencyKey: "original-key" });
  });
  it.each(["read", "execute", "cancel"] as const)("keeps %s on the existing operation and correlates database failures", async action => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.operation.mockRejectedValueOnce({ code: "P2028" });
    const response = await refundOperationItem(request(action === "read" ? "GET" : "POST", action === "read" ? undefined : {}), api, "original-op", action);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "REFUND_TEMPORARILY_UNAVAILABLE", requestId: response.headers.get("x-request-id") } });
    expect(mocks.operation).toHaveBeenCalledWith(expect.any(Object), "original-op", action);
    expect(log).toHaveBeenCalledTimes(1);
    expect(mocks.register).not.toHaveBeenCalled();
  });
});

it("gives every refund route the bounded 150-second execution allowance", async () => {
  const routes = [
    "vendor/payments/[transactionId]/refund/route.ts", "vendor/v1/payment-requests/[id]/refunds/route.ts",
    ...["vendor/refund-operations", "vendor/v1/refund-operations"].flatMap(base => ["route.ts", "[id]/route.ts", "[id]/execute/route.ts", "[id]/cancel/route.ts"].map(path => `${base}/${path}`)),
  ];
  for (const route of routes) expect(await readFile(new URL(`../app/api/${route}`, import.meta.url), "utf8")).toMatch(/export const maxDuration = 150;/);
});
