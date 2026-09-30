// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), verify: vi.fn(), config: vi.fn(), disable: vi.fn(), history: vi.fn(), retry: vi.fn(), dispatch: vi.fn() }));
vi.mock("@/lib/vendors/routeAuth", () => ({ vendorFromPortalSession: mocks.owner }));
vi.mock("@/lib/vendors/paymentWebhooks", () => ({ configurePaymentWebhook: mocks.config, disablePaymentWebhook: mocks.disable, getPaymentWebhookConfiguration: mocks.config, paymentWebhookHistory: mocks.history, retryPaymentWebhook: mocks.retry, dispatchPaymentWebhooks: mocks.dispatch }));
vi.mock("@/lib/vendors/paymentWebhookAfter", () => ({ schedulePaymentWebhookDispatch: vi.fn() }));
vi.mock("@upstash/qstash", () => ({ Receiver: class { verify = mocks.verify; } }));
import { GET, PUT, DELETE } from "@/app/api/vendor/integrations/payment-webhook/route";
import { GET as history } from "@/app/api/vendor/integrations/payment-webhook/history/route";
import { POST as retry } from "@/app/api/vendor/integrations/payment-webhook/events/[eventId]/retry/route";
import { POST as dispatch } from "@/app/api/jobs/payment-webhooks/route";
beforeEach(() => { vi.clearAllMocks(); mocks.owner.mockResolvedValue(null); vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "current"); vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "next"); vi.stubEnv("PAYMENT_WEBHOOK_DISPATCH_URL", "https://portal.example/api/jobs/payment-webhooks"); });
describe("Owner payment callback boundaries", () => {
  const url = "https://portal.example/api/vendor/integrations/payment-webhook";
  it("rejects staff/unauthenticated config, history and retries before accessing events", async () => {
    expect((await GET()).status).toBe(403);
    expect((await PUT(new Request(url, { method: "PUT", headers: { origin: "https://portal.example" }, body: "{}" }))).status).toBe(403);
    expect((await DELETE(new Request(url, { method: "DELETE", headers: { origin: "https://portal.example" } }))).status).toBe(403);
    expect((await history(new Request(`${url}/history`))).status).toBe(403);
    expect((await retry(new Request(`${url}/events/e/retry`, { method: "POST", headers: { origin: "https://portal.example" } }), { params: Promise.resolve({ eventId: "e" }) })).status).toBe(403);
    expect(mocks.config).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
  });
  it("rejects cross-origin configuration and uses only the authenticated owner vendor", async () => {
    mocks.owner.mockResolvedValue({ id: "owned-vendor" }); mocks.config.mockResolvedValue({ secret: "shown-once" });
    expect((await PUT(new Request(url, { method: "PUT", headers: { origin: "https://foreign.example" }, body: "{}" }))).status).toBe(403);
    const response = await PUT(new Request(url, { method: "PUT", headers: { origin: "https://portal.example" }, body: JSON.stringify({ url: "https://receiver.example", branchIds: ["branch"] }) }));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.config).toHaveBeenCalledWith("owned-vendor", { url: "https://receiver.example", branchIds: ["branch"] });
  });
});
describe("Signed scheduler", () => {
  const url = "https://portal.example/api/jobs/payment-webhooks";
  it("rejects missing or forged signatures and checks the exact configured URL/body", async () => {
    expect((await dispatch(new Request(url, { method: "POST", body: "{}" }))).status).toBe(401);
    mocks.verify.mockRejectedValueOnce(new Error("forged"));
    expect((await dispatch(new Request(url, { method: "POST", body: "{}", headers: { "upstash-signature": "forged" } }))).status).toBe(401);
    expect(mocks.dispatch).not.toHaveBeenCalled();
    mocks.verify.mockResolvedValue(true); mocks.dispatch.mockResolvedValue({ processed: 0 });
    expect((await dispatch(new Request(url, { method: "POST", body: "{}", headers: { "upstash-signature": "signed" } }))).status).toBe(200);
    expect(mocks.verify).toHaveBeenLastCalledWith({ signature: "signed", body: "{}", url });
    expect((await dispatch(new Request(url, { method: "POST", body: '{"payment":1}', headers: { "upstash-signature": "signed" } }))).status).toBe(400);
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
  });
});
