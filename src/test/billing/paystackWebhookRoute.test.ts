import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/paymentProviders/paystack/config", () => ({ resolvePaystackProviderConfig: vi.fn() }));
vi.mock("@/lib/billing/gatewayEvents", () => ({
  recordGatewayEvent: vi.fn(),
  markGatewayEventProcessed: vi.fn(),
  recordGatewayEventFailure: vi.fn(),
}));
vi.mock("@/lib/billing/paymentConfirmation", () => ({ confirmInvoicePayment: vi.fn() }));
vi.mock("@/lib/billing/exceptions", () => ({ recordBillingException: vi.fn() }));

import { POST } from "@/app/api/webhooks/paystack/route";
import { resolvePaystackProviderConfig } from "@/lib/paymentProviders/paystack/config";
import { recordGatewayEvent, markGatewayEventProcessed, recordGatewayEventFailure } from "@/lib/billing/gatewayEvents";
import { confirmInvoicePayment } from "@/lib/billing/paymentConfirmation";
import { recordBillingException } from "@/lib/billing/exceptions";

const SECRET_KEY = "sk_test_fixture";
const CONFIG = {
  secretKey: SECRET_KEY,
  mode: "test",
  accountRef: "university-demo",
  subaccountCode: "ACCT_X",
  expectedIntegrationId: "2001638",
  baseUrl: "https://api.paystack.example",
};

function signatureFor(body: string) {
  return createHmac("sha512", SECRET_KEY).update(body).digest("hex");
}

function webhookRequest(body: string, signature = signatureFor(body)) {
  return new Request("http://localhost:3000/api/webhooks/paystack", {
    method: "POST",
    headers: { "x-paystack-signature": signature },
    body,
  });
}

describe("POST /api/webhooks/paystack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolvePaystackProviderConfig).mockReturnValue(CONFIG);
  });

  it("rejects a request with an invalid signature", async () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "unify-inv-abc" } });

    const response = await POST(webhookRequest(body, "not-the-real-signature"));

    expect(response.status).toBe(401);
    expect(recordGatewayEvent).not.toHaveBeenCalled();
  });

  it("rejects a request whose body was altered after signing", async () => {
    const original = JSON.stringify({ event: "charge.success", data: { reference: "unify-inv-abc" } });
    const signature = signatureFor(original);
    const tampered = JSON.stringify({ event: "charge.success", data: { reference: "unify-inv-tampered" } });

    const response = await POST(webhookRequest(tampered, signature));

    expect(response.status).toBe(401);
  });

  it("rejects a missing signature header", async () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "unify-inv-abc" } });
    const request = new Request("http://localhost:3000/api/webhooks/paystack", { method: "POST", body });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });

  it("rejects an oversized payload before checking the signature", async () => {
    const body = "a".repeat(300 * 1024);

    const response = await POST(webhookRequest(body, signatureFor(body)));

    expect(response.status).toBe(413);
  });

  it("acknowledges but ignores malformed JSON", async () => {
    const response = await POST(webhookRequest("not json"));
    expect(response.status).toBe(400);
  });

  it("acknowledges and ignores an unrelated event type", async () => {
    const body = JSON.stringify({ event: "subscription.create", data: { reference: "unify-inv-abc" } });

    const response = await POST(webhookRequest(body));

    expect(response.status).toBe(202);
    expect(recordGatewayEvent).not.toHaveBeenCalled();
    expect(confirmInvoicePayment).not.toHaveBeenCalled();
  });

  it("records a review exception for a dispute/refund event without changing any financial projection", async () => {
    const body = JSON.stringify({ event: "charge.dispute.create", data: { reference: "unify-inv-abc" } });

    const response = await POST(webhookRequest(body));

    expect(response.status).toBe(202);
    expect(recordBillingException).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ type: "PAYMENT_REVIEW_EVENT" }),
    );
    expect(confirmInvoicePayment).not.toHaveBeenCalled();
  });

  it("deduplicates a replayed charge.success delivery without reprocessing it", async () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "unify-inv-abc" } });
    vi.mocked(recordGatewayEvent).mockResolvedValue({ id: "event-1", duplicate: true });

    const response = await POST(webhookRequest(body));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(confirmInvoicePayment).not.toHaveBeenCalled();
  });

  it("routes a new charge.success event through confirmInvoicePayment and marks it processed", async () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "unify-inv-abc" } });
    vi.mocked(recordGatewayEvent).mockResolvedValue({ id: "event-1", duplicate: false });
    vi.mocked(confirmInvoicePayment).mockResolvedValue({ outcome: "confirmed", invoiceId: "invoice-1", paymentId: "payment-1" });

    const response = await POST(webhookRequest(body));

    expect(response.status).toBe(202);
    expect(confirmInvoicePayment).toHaveBeenCalledWith({}, { reference: "unify-inv-abc", config: CONFIG });
    expect(markGatewayEventProcessed).toHaveBeenCalledWith({}, "event-1");
    await expect(response.json()).resolves.toEqual({ received: true, outcome: "confirmed" });
  });

  it("records a durable failure and returns 500 so Paystack retries, without acknowledging success", async () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "unify-inv-abc" } });
    vi.mocked(recordGatewayEvent).mockResolvedValue({ id: "event-1", duplicate: false });
    vi.mocked(confirmInvoicePayment).mockRejectedValue(new Error("unexpected"));

    const response = await POST(webhookRequest(body));

    expect(response.status).toBe(500);
    expect(recordGatewayEventFailure).toHaveBeenCalledWith({}, "event-1", expect.any(Error), 60);
    expect(markGatewayEventProcessed).not.toHaveBeenCalled();
  });

  it("never persists the sensitive authorization/customer sub-objects in the gateway event snapshot", async () => {
    const body = JSON.stringify({
      event: "charge.success",
      data: {
        reference: "unify-inv-abc",
        amount: 1000,
        authorization: { authorization_code: "AUTH_secret", card_type: "visa", last4: "1234" },
        customer: { email: "vendor@example.test", phone: "+27000000000" },
      },
    });
    vi.mocked(recordGatewayEvent).mockResolvedValue({ id: "event-1", duplicate: false });
    vi.mocked(confirmInvoicePayment).mockResolvedValue({ outcome: "confirmed", invoiceId: "invoice-1", paymentId: "payment-1" });

    await POST(webhookRequest(body));

    const snapshot = vi.mocked(recordGatewayEvent).mock.calls[0][1].payloadSnapshot as Record<string, unknown>;
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("AUTH_secret");
    expect(serialized).not.toContain("vendor@example.test");
  });
});
