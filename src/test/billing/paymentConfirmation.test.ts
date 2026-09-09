import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/paymentProviders/paystack/client", () => ({
  verifyTransaction: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { verifyTransaction } from "@/lib/paymentProviders/paystack/client";
import { confirmInvoicePayment } from "@/lib/billing/paymentConfirmation";

const CONFIG = {
  secretKey: "sk_test_fixture",
  mode: "test",
  accountRef: "university-demo",
  subaccountCode: "ACCT_PLATFORM_TEST_CODE",
  expectedIntegrationId: "2001638",
  baseUrl: "https://api.paystack.example",
};

function baseAttempt(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "attempt-1",
    invoiceId: "invoice-1",
    provider: "paystack",
    providerAccountRef: "university-demo",
    providerMode: "test",
    reference: "unify-inv-abc",
    expectedAmountMinor: BigInt(1000),
    currency: "ZAR",
    subaccountCode: "ACCT_PLATFORM_TEST_CODE",
    status: "READY",
    ...overrides,
  };
}

function verifiedSuccess(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    providerTransactionId: "txn-1",
    reference: "unify-inv-abc",
    status: "success",
    amountMinor: BigInt(1000),
    currency: "ZAR",
    domain: "test",
    paidAtIso: "2026-09-11T10:00:00.000Z",
    gatewayResponse: "Successful",
    subaccountCode: "ACCT_PLATFORM_TEST_CODE",
    feesMinor: BigInt(15),
    splitEvidence: null,
    ...overrides,
  };
}

function makeDb({
  attempt,
  createPaymentImpl,
  createAllocationImpl,
}: {
  attempt: Record<string, unknown> | null;
  createPaymentImpl?: () => Promise<unknown>;
  createAllocationImpl?: () => Promise<unknown>;
}) {
  const tx = {
    vendorInvoicePaymentAttempt: {
      findUnique: vi.fn().mockResolvedValue(attempt),
      update: vi.fn().mockResolvedValue({}),
    },
    vendorInvoicePayment: {
      create: vi.fn(createPaymentImpl ?? (() => Promise.resolve({ id: "payment-1", grossAmountMinor: BigInt(1000) }))),
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
    },
    vendorInvoicePaymentAllocation: {
      create: vi.fn(createAllocationImpl ?? (() => Promise.resolve({ id: "allocation-1" }))),
      findUnique: vi.fn(),
    },
    vendorInvoice: { update: vi.fn().mockResolvedValue({}) },
    billingException: { upsert: vi.fn() },
  };
  const db = tx as unknown as Parameters<typeof confirmInvoicePayment>[0];
  return { db, tx };
}

describe("confirmInvoicePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirms a matching successful payment: one receipt, one allocation, invoice marked PAID", async () => {
    const { db, tx } = makeDb({ attempt: baseAttempt() });
    vi.mocked(verifyTransaction).mockResolvedValue(verifiedSuccess());

    const result = await confirmInvoicePayment(db, { reference: "unify-inv-abc", config: CONFIG });

    expect(result).toEqual({ outcome: "confirmed", invoiceId: "invoice-1", paymentId: "payment-1" });
    expect(tx.vendorInvoicePayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerTransactionId: "txn-1", grossAmountMinor: BigInt(1000) }) }),
    );
    expect(tx.vendorInvoicePaymentAllocation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ invoiceId: "invoice-1", paymentId: "payment-1", amountAppliedMinor: BigInt(1000) }) }),
    );
    expect(tx.vendorInvoice.update).toHaveBeenCalledWith({ where: { id: "invoice-1" }, data: { paymentStatus: "PAID" } });
    expect(tx.vendorInvoicePaymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED" }) }),
    );
  });

  it("reports an unrecognized reference as attempt_not_found and records an exception, without settling anything", async () => {
    const { db, tx } = makeDb({ attempt: null });
    vi.mocked(verifyTransaction).mockResolvedValue(verifiedSuccess({ reference: "unify-inv-foreign" }));

    const result = await confirmInvoicePayment(db, { reference: "unify-inv-foreign", config: CONFIG });

    expect(result).toEqual({ outcome: "attempt_not_found" });
    expect(tx.vendorInvoicePayment.create).not.toHaveBeenCalled();
    expect(tx.billingException.upsert).toHaveBeenCalled();
  });

  it("does not settle a failed/abandoned transaction", async () => {
    const { db, tx } = makeDb({ attempt: baseAttempt() });
    vi.mocked(verifyTransaction).mockResolvedValue(verifiedSuccess({ status: "abandoned" }));

    const result = await confirmInvoicePayment(db, { reference: "unify-inv-abc", config: CONFIG });

    expect(result).toEqual({ outcome: "not_successful", providerStatus: "abandoned" });
    expect(tx.vendorInvoicePayment.create).not.toHaveBeenCalled();
    expect(tx.vendorInvoicePaymentAttempt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });

  it("never lets a late failed observation overwrite an already-succeeded attempt", async () => {
    const { db, tx } = makeDb({ attempt: baseAttempt({ status: "SUCCEEDED" }) });
    vi.mocked(verifyTransaction).mockResolvedValue(verifiedSuccess({ status: "abandoned" }));

    await confirmInvoicePayment(db, { reference: "unify-inv-abc", config: CONFIG });

    expect(tx.vendorInvoicePaymentAttempt.update).not.toHaveBeenCalled();
  });

  it("rejects a wrong amount and does not mark the invoice paid", async () => {
    const { db, tx } = makeDb({ attempt: baseAttempt() });
    vi.mocked(verifyTransaction).mockResolvedValue(verifiedSuccess({ amountMinor: BigInt(1) }));

    const result = await confirmInvoicePayment(db, { reference: "unify-inv-abc", config: CONFIG });

    expect(result).toEqual({ outcome: "mismatch", reason: "amount" });
    expect(tx.vendorInvoicePayment.create).not.toHaveBeenCalled();
    expect(tx.vendorInvoice.update).not.toHaveBeenCalled();
  });

  it("rejects a wrong currency", async () => {
    const { db } = makeDb({ attempt: baseAttempt() });
    vi.mocked(verifyTransaction).mockResolvedValue(verifiedSuccess({ currency: "NGN" }));

    const result = await confirmInvoicePayment(db, { reference: "unify-inv-abc", config: CONFIG });
    expect(result).toEqual({ outcome: "mismatch", reason: "currency" });
  });

  it("rejects a wrong provider account/mode", async () => {
    const { db } = makeDb({ attempt: baseAttempt({ providerMode: "live" }) });
    vi.mocked(verifyTransaction).mockResolvedValue(verifiedSuccess());

    const result = await confirmInvoicePayment(db, { reference: "unify-inv-abc", config: CONFIG });
    expect(result).toEqual({ outcome: "mismatch", reason: "account" });
  });

  it("settles a genuine match with a split anomaly as collected-with-exception, not discarded", async () => {
    const { db, tx } = makeDb({ attempt: baseAttempt() });
    vi.mocked(verifyTransaction).mockResolvedValue(verifiedSuccess({ subaccountCode: "ACCT_WRONG" }));

    const result = await confirmInvoicePayment(db, { reference: "unify-inv-abc", config: CONFIG });

    expect(result).toEqual({ outcome: "confirmed", invoiceId: "invoice-1", paymentId: "payment-1" });
    expect(tx.billingException.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ type: "PAYMENT_SPLIT_MISMATCH" }) }));
    expect(tx.vendorInvoice.update).toHaveBeenCalledWith({ where: { id: "invoice-1" }, data: { paymentStatus: "PAID", hasUnresolvedException: true } });
  });

  it("does not duplicate the allocation on a replayed webhook for the same attempt", async () => {
    const p2002 = Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["vendor_invoice_payment_attemptId_key"] } });
    const { db, tx } = makeDb({ attempt: baseAttempt(), createPaymentImpl: () => Promise.reject(p2002) });
    tx.vendorInvoicePayment.findUniqueOrThrow.mockResolvedValue({ id: "payment-existing" });
    tx.vendorInvoicePaymentAllocation.findUnique.mockResolvedValue({ id: "allocation-existing" });
    vi.mocked(verifyTransaction).mockResolvedValue(verifiedSuccess());

    const result = await confirmInvoicePayment(db, { reference: "unify-inv-abc", config: CONFIG });

    expect(result).toEqual({ outcome: "already_confirmed", invoiceId: "invoice-1", paymentId: "payment-existing" });
    expect(tx.vendorInvoicePaymentAllocation.create).not.toHaveBeenCalled();
  });

  it("keeps a second genuinely successful attempt's receipt but reports it excess, never double-allocating", async () => {
    const p2002 = Object.assign(new Error("unique"), { code: "P2002", meta: { target: ["vendor_invoice_payment_allocation_invoiceId_key"] } });
    const { db, tx } = makeDb({ attempt: baseAttempt(), createAllocationImpl: () => Promise.reject(p2002) });
    vi.mocked(verifyTransaction).mockResolvedValue(verifiedSuccess());

    const result = await confirmInvoicePayment(db, { reference: "unify-inv-abc", config: CONFIG });

    expect(result).toEqual({ outcome: "excess", invoiceId: "invoice-1", paymentId: "payment-1" });
    expect(tx.vendorInvoicePayment.create).toHaveBeenCalled();
    expect(tx.vendorInvoice.update).toHaveBeenCalledWith({ where: { id: "invoice-1" }, data: { hasUnresolvedException: true } });
    expect(tx.billingException.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ type: "PAYMENT_EXCESS" }) }));
  });
});
