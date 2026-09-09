import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/paymentProviders/paystack/client", () => ({
  initializeTransaction: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { initializeTransaction } from "@/lib/paymentProviders/paystack/client";
import { PaystackProviderError } from "@/lib/paymentProviders/paystack/errors";
import { prepareInvoicePaymentAttempt, type PaymentAttemptClient } from "@/lib/billing/paymentAttempts";
import { BillingDomainError } from "@/lib/billing/errors";

const CONFIG = {
  secretKey: "sk_test_fixture",
  mode: "test",
  accountRef: "university-demo",
  subaccountCode: "ACCT_PLATFORM_TEST_CODE",
  expectedIntegrationId: "2001638",
  baseUrl: "https://api.paystack.example",
};

function baseInvoice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "invoice-1",
    documentStatus: "ISSUED",
    paymentStatus: "UNPAID",
    totalMinor: BigInt(1000),
    universityShareMinor: BigInt(900),
    currency: "ZAR",
    customerSnapshot: { contactEmail: "vendor@example.test" },
    ...overrides,
  };
}

function makeDb({ invoice, latestAttempt, priorAttemptCount = 0 }: { invoice: ReturnType<typeof baseInvoice>; latestAttempt?: Record<string, unknown> | null; priorAttemptCount?: number }) {
  const createdAttempt = { id: "attempt-new", reference: "unify-inv-generated" };
  const tx = {
    vendorInvoice: { findUniqueOrThrow: vi.fn().mockResolvedValue(invoice) },
    vendorInvoicePaymentAttempt: {
      findFirst: vi.fn().mockResolvedValue(latestAttempt ?? null),
      count: vi.fn().mockResolvedValue(priorAttemptCount),
      create: vi.fn().mockResolvedValue(createdAttempt),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...createdAttempt, ...data })),
    },
    billingException: { upsert: vi.fn() },
  };
  const db = {
    ...tx,
    $transaction: vi.fn((fn: (transaction: typeof tx) => unknown) => fn(tx)),
  } as unknown as PaymentAttemptClient & { $transaction: typeof tx.vendorInvoice.findUniqueOrThrow } & typeof tx;
  return { db, tx, createdAttempt };
}

describe("prepareInvoicePaymentAttempt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a DRAFT invoice", async () => {
    const { db } = makeDb({ invoice: baseInvoice({ documentStatus: "DRAFT" }) });

    await expect(
      prepareInvoicePaymentAttempt(db, { invoiceId: "invoice-1", ownerUserId: "user-1", config: CONFIG, callbackUrl: "https://x/return" }),
    ).rejects.toThrow(BillingDomainError);
  });

  it("refuses an already-paid invoice", async () => {
    const { db } = makeDb({ invoice: baseInvoice({ paymentStatus: "PAID" }) });

    await expect(
      prepareInvoicePaymentAttempt(db, { invoiceId: "invoice-1", ownerUserId: "user-1", config: CONFIG, callbackUrl: "https://x/return" }),
    ).rejects.toThrow(BillingDomainError);
  });

  it("refuses a zero-total invoice", async () => {
    const { db } = makeDb({ invoice: baseInvoice({ totalMinor: BigInt(0) }) });

    await expect(
      prepareInvoicePaymentAttempt(db, { invoiceId: "invoice-1", ownerUserId: "user-1", config: CONFIG, callbackUrl: "https://x/return" }),
    ).rejects.toThrow(BillingDomainError);
  });

  it("creates a fresh attempt, initializes it against the university's gross share, and returns it READY", async () => {
    const { db, tx } = makeDb({ invoice: baseInvoice() });
    vi.mocked(initializeTransaction).mockResolvedValue({
      authorizationUrl: "https://checkout.paystack.com/xyz",
      accessCode: "xyz",
      reference: "unify-inv-generated",
    });

    const result = await prepareInvoicePaymentAttempt(db, {
      invoiceId: "invoice-1",
      ownerUserId: "user-1",
      config: CONFIG,
      callbackUrl: "https://demo-host/vendor/invoices/invoice-1/payment-return",
    });

    expect(tx.vendorInvoicePaymentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceId: "invoice-1",
          expectedAmountMinor: BigInt(1000),
          transactionChargeMinor: BigInt(900),
          feeBearer: "UNIVERSITY",
          status: "PREPARING",
        }),
      }),
    );
    expect(initializeTransaction).toHaveBeenCalledWith(
      CONFIG.secretKey,
      CONFIG.baseUrl,
      expect.objectContaining({
        email: "vendor@example.test",
        amountMinor: BigInt(1000),
        transactionChargeMinor: BigInt(900),
        reference: expect.stringMatching(/^unify-inv-/),
      }),
    );
    expect(result).toEqual({
      attemptId: "attempt-new",
      reference: "unify-inv-generated",
      status: "READY",
      accessCode: "xyz",
      authorizationUrl: "https://checkout.paystack.com/xyz",
      reused: false,
    });
  });

  it("reuses a usable READY attempt within the reuse window without calling Paystack again", async () => {
    const recentReady = {
      id: "attempt-existing",
      reference: "unify-inv-existing",
      status: "READY",
      accessCode: "old-access-code",
      authorizationUrl: "https://checkout.paystack.com/old",
      updatedAt: new Date(Date.now() - 60_000),
    };
    const { db } = makeDb({ invoice: baseInvoice(), latestAttempt: recentReady });

    const result = await prepareInvoicePaymentAttempt(db, {
      invoiceId: "invoice-1",
      ownerUserId: "user-1",
      config: CONFIG,
      callbackUrl: "https://x/return",
    });

    expect(initializeTransaction).not.toHaveBeenCalled();
    expect(result).toMatchObject({ attemptId: "attempt-existing", reused: true, status: "READY" });
  });

  it("returns a fresh PREPARING attempt's confirming state instead of starting a second one", async () => {
    const freshPreparing = {
      id: "attempt-preparing",
      reference: "unify-inv-preparing",
      status: "PREPARING",
      accessCode: null,
      authorizationUrl: null,
      updatedAt: new Date(),
    };
    const { db, tx } = makeDb({ invoice: baseInvoice(), latestAttempt: freshPreparing });

    const result = await prepareInvoicePaymentAttempt(db, {
      invoiceId: "invoice-1",
      ownerUserId: "user-1",
      config: CONFIG,
      callbackUrl: "https://x/return",
    });

    expect(tx.vendorInvoicePaymentAttempt.create).not.toHaveBeenCalled();
    expect(initializeTransaction).not.toHaveBeenCalled();
    expect(result).toMatchObject({ attemptId: "attempt-preparing", reused: true, status: "PREPARING" });
  });

  it("abandons a stale PREPARING attempt (crashed process) and starts a new one", async () => {
    const stalePreparing = {
      id: "attempt-stale",
      reference: "unify-inv-stale",
      status: "PREPARING",
      accessCode: null,
      authorizationUrl: null,
      updatedAt: new Date(Date.now() - 10 * 60_000),
    };
    const { db, tx } = makeDb({ invoice: baseInvoice(), latestAttempt: stalePreparing });
    vi.mocked(initializeTransaction).mockResolvedValue({ authorizationUrl: "https://x", accessCode: "new", reference: "unify-inv-generated" });

    const result = await prepareInvoicePaymentAttempt(db, {
      invoiceId: "invoice-1",
      ownerUserId: "user-1",
      config: CONFIG,
      callbackUrl: "https://x/return",
    });

    expect(tx.vendorInvoicePaymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "attempt-stale" }, data: { status: "FAILED" } }),
    );
    expect(tx.billingException.upsert).toHaveBeenCalled();
    expect(result.reused).toBe(false);
  });

  it("expires an old READY attempt past the reuse window and starts a new one", async () => {
    const expiredReady = {
      id: "attempt-expired",
      reference: "unify-inv-expired",
      status: "READY",
      accessCode: "expired-code",
      authorizationUrl: "https://checkout.paystack.com/expired",
      updatedAt: new Date(Date.now() - 60 * 60_000),
    };
    const { db, tx } = makeDb({ invoice: baseInvoice(), latestAttempt: expiredReady });
    vi.mocked(initializeTransaction).mockResolvedValue({ authorizationUrl: "https://x", accessCode: "new", reference: "unify-inv-generated" });

    await prepareInvoicePaymentAttempt(db, { invoiceId: "invoice-1", ownerUserId: "user-1", config: CONFIG, callbackUrl: "https://x/return" });

    expect(tx.vendorInvoicePaymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "attempt-expired" }, data: { status: "FAILED" } }),
    );
    expect(initializeTransaction).toHaveBeenCalled();
  });

  it("marks the attempt UNKNOWN (not FAILED) and does not throw on an ambiguous timeout", async () => {
    const { db, tx } = makeDb({ invoice: baseInvoice() });
    vi.mocked(initializeTransaction).mockRejectedValue(new PaystackProviderError("TIMEOUT", "timed out"));

    const result = await prepareInvoicePaymentAttempt(db, {
      invoiceId: "invoice-1",
      ownerUserId: "user-1",
      config: CONFIG,
      callbackUrl: "https://x/return",
    });

    expect(result.status).toBe("UNKNOWN");
    expect(tx.vendorInvoicePaymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "UNKNOWN" } }),
    );
  });

  it("marks the attempt FAILED and rethrows on a definite provider rejection", async () => {
    const { db, tx } = makeDb({ invoice: baseInvoice() });
    vi.mocked(initializeTransaction).mockRejectedValue(new PaystackProviderError("HTTP_ERROR", "bad subaccount"));

    await expect(
      prepareInvoicePaymentAttempt(db, { invoiceId: "invoice-1", ownerUserId: "user-1", config: CONFIG, callbackUrl: "https://x/return" }),
    ).rejects.toBeInstanceOf(PaystackProviderError);

    expect(tx.vendorInvoicePaymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "FAILED" } }),
    );
  });

  it("fails closed when the invoice's customer snapshot has no contact email", async () => {
    const { db, tx } = makeDb({ invoice: baseInvoice({ customerSnapshot: {} }) });

    await expect(
      prepareInvoicePaymentAttempt(db, { invoiceId: "invoice-1", ownerUserId: "user-1", config: CONFIG, callbackUrl: "https://x/return" }),
    ).rejects.toThrow(BillingDomainError);
    expect(initializeTransaction).not.toHaveBeenCalled();
    expect(tx.vendorInvoicePaymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "FAILED" } }),
    );
  });
});
