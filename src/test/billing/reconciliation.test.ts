import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing/paymentConfirmation", () => ({ confirmInvoicePayment: vi.fn() }));
vi.mock("@/lib/billing/gatewayEvents", () => ({ recordGatewayEventFailure: vi.fn(), markGatewayEventProcessed: vi.fn() }));
vi.mock("@/lib/paymentProviders/paystack/config", () => ({ resolvePaystackProviderConfig: vi.fn() }));

import { confirmInvoicePayment } from "@/lib/billing/paymentConfirmation";
import { markGatewayEventProcessed, recordGatewayEventFailure } from "@/lib/billing/gatewayEvents";
import { resolvePaystackProviderConfig } from "@/lib/paymentProviders/paystack/config";
import { runVendorBillingReconciliation, type ReconciliationClient } from "@/lib/billing/reconciliation";

const CONFIG = {
  secretKey: "sk_test_fixture",
  mode: "test",
  accountRef: "university-demo",
  subaccountCode: "ACCT_X",
  expectedIntegrationId: "2001638",
  baseUrl: "https://api.paystack.example",
};

function makeDb(overrides: { staleAttempts?: unknown[]; failedEvents?: unknown[]; stillUnresolvedCount?: number } = {}) {
  return {
    vendorInvoicePaymentAttempt: {
      findMany: vi.fn().mockResolvedValue(overrides.staleAttempts ?? []),
      count: vi.fn().mockResolvedValue(overrides.stillUnresolvedCount ?? 0),
    },
    billingGatewayEvent: {
      findMany: vi.fn().mockResolvedValue(overrides.failedEvents ?? []),
    },
  } as unknown as ReconciliationClient;
}

describe("runVendorBillingReconciliation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing and reports unconfigured when Paystack isn't configured", async () => {
    vi.mocked(resolvePaystackProviderConfig).mockImplementation(() => {
      throw new Error("not configured");
    });
    const db = makeDb();

    const summary = await runVendorBillingReconciliation(db);

    expect(summary.configured).toBe(false);
    expect(confirmInvoicePayment).not.toHaveBeenCalled();
    expect(db.vendorInvoicePaymentAttempt.findMany).not.toHaveBeenCalled();
  });

  it("re-verifies stale unresolved attempts and counts confirmations", async () => {
    vi.mocked(resolvePaystackProviderConfig).mockReturnValue(CONFIG);
    const db = makeDb({ staleAttempts: [{ reference: "unify-inv-a" }, { reference: "unify-inv-b" }] });
    vi.mocked(confirmInvoicePayment)
      .mockResolvedValueOnce({ outcome: "confirmed", invoiceId: "invoice-1", paymentId: "payment-1" })
      .mockResolvedValueOnce({ outcome: "not_successful", providerStatus: "abandoned" });

    const summary = await runVendorBillingReconciliation(db);

    expect(summary.attemptsSwept).toBe(2);
    expect(summary.attemptsConfirmed).toBe(1);
    expect(confirmInvoicePayment).toHaveBeenCalledWith(db, expect.objectContaining({ reference: "unify-inv-a", config: CONFIG }));
    expect(confirmInvoicePayment).toHaveBeenCalledWith(db, expect.objectContaining({ reference: "unify-inv-b", config: CONFIG }));
  });

  it("does not let one attempt's unexpected error stop the sweep", async () => {
    vi.mocked(resolvePaystackProviderConfig).mockReturnValue(CONFIG);
    const db = makeDb({ staleAttempts: [{ reference: "unify-inv-a" }, { reference: "unify-inv-b" }] });
    vi.mocked(confirmInvoicePayment)
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce({ outcome: "confirmed", invoiceId: "invoice-1", paymentId: "payment-1" });

    const summary = await runVendorBillingReconciliation(db);

    expect(summary.attemptsSwept).toBe(2);
    expect(summary.attemptsConfirmed).toBe(1);
  });

  it("retries a durably-failed gateway event and marks it processed on recovery", async () => {
    vi.mocked(resolvePaystackProviderConfig).mockReturnValue(CONFIG);
    const db = makeDb({ failedEvents: [{ id: "event-1", resourceKey: "unify-inv-c" }] });
    vi.mocked(confirmInvoicePayment).mockResolvedValue({ outcome: "confirmed", invoiceId: "invoice-1", paymentId: "payment-1" });

    const summary = await runVendorBillingReconciliation(db);

    expect(summary.gatewayEventsRetried).toBe(1);
    expect(summary.gatewayEventsRecovered).toBe(1);
    expect(markGatewayEventProcessed).toHaveBeenCalledWith(db, "event-1", expect.any(Date));
    expect(recordGatewayEventFailure).not.toHaveBeenCalled();
  });

  it("re-records the failure with backoff when a retried gateway event still fails", async () => {
    vi.mocked(resolvePaystackProviderConfig).mockReturnValue(CONFIG);
    const db = makeDb({ failedEvents: [{ id: "event-1", resourceKey: "unify-inv-c" }] });
    vi.mocked(confirmInvoicePayment).mockRejectedValue(new Error("still down"));

    const summary = await runVendorBillingReconciliation(db);

    expect(summary.gatewayEventsStillFailing).toBe(1);
    expect(summary.gatewayEventsRecovered).toBe(0);
    expect(recordGatewayEventFailure).toHaveBeenCalledWith(db, "event-1", expect.any(Error), 300);
    expect(markGatewayEventProcessed).not.toHaveBeenCalled();
  });

  it("reports the current count of still-unresolved attempts after the sweep", async () => {
    vi.mocked(resolvePaystackProviderConfig).mockReturnValue(CONFIG);
    const db = makeDb({ stillUnresolvedCount: 7 });

    const summary = await runVendorBillingReconciliation(db);

    expect(summary.attemptsStillUnresolved).toBe(7);
  });
});
