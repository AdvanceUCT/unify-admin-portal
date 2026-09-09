import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/env", () => ({
  env: { APP_URL: "http://localhost:3000", VERIFICATION_INVOICE_CHECKOUT_ENABLED: true },
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentVendorSession: vi.fn() }));
vi.mock("@/lib/billing/vendorAuthorization", () => ({ getVendorInvoiceOwnerContext: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    vendorInvoice: { findFirst: vi.fn() },
    vendorInvoicePaymentAttempt: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/billing/paymentAttempts", () => ({ prepareInvoicePaymentAttempt: vi.fn() }));
vi.mock("@/lib/billing/paymentConfirmation", () => ({ confirmInvoicePayment: vi.fn() }));
vi.mock("@/lib/paymentProviders/paystack/config", () => ({ resolvePaystackProviderConfig: vi.fn() }));

import { POST as postPaymentAttempt } from "@/app/api/vendor/invoices/[invoiceId]/payment-attempts/route";
import { POST as postReconcile } from "@/app/api/vendor/invoices/[invoiceId]/reconcile/route";
import { getCurrentVendorSession } from "@/lib/auth/session";
import { getVendorInvoiceOwnerContext } from "@/lib/billing/vendorAuthorization";
import { prisma } from "@/lib/db/prisma";
import { prepareInvoicePaymentAttempt } from "@/lib/billing/paymentAttempts";
import { confirmInvoicePayment } from "@/lib/billing/paymentConfirmation";
import { resolvePaystackProviderConfig } from "@/lib/paymentProviders/paystack/config";
import { BillingDomainError } from "@/lib/billing/errors";

const ownerSession = { user: { id: "owner-user", userType: "VENDOR" } } as Awaited<ReturnType<typeof getCurrentVendorSession>>;
const ownerContext = { userId: "owner-user", vendorProfileId: "vendor-001", companyName: "Library Cafe" };
const CONFIG = {
  secretKey: "sk_test_fixture",
  mode: "test",
  accountRef: "university-demo",
  subaccountCode: "ACCT_X",
  expectedIntegrationId: "2001638",
  baseUrl: "https://api.paystack.example",
};

function params(invoiceId: string) {
  return { params: Promise.resolve({ invoiceId }) };
}

function sameOriginRequest(body?: unknown) {
  return new Request("http://localhost:3000/api/vendor/invoices/invoice-1/payment-attempts", {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function crossOriginRequest() {
  return new Request("http://localhost:3000/api/vendor/invoices/invoice-1/payment-attempts", {
    method: "POST",
    headers: { origin: "https://evil.example" },
  });
}

describe("POST /api/vendor/invoices/[invoiceId]/payment-attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolvePaystackProviderConfig).mockReturnValue(CONFIG);
  });

  it("returns 401 when there is no vendor session (staff or unauthenticated)", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(null);

    const response = await postPaymentAttempt(sameOriginRequest(), params("invoice-1"));

    expect(response.status).toBe(401);
    expect(prepareInvoicePaymentAttempt).not.toHaveBeenCalled();
  });

  it("returns 403 for a vendor user with no active owner membership (staff)", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(null);

    const response = await postPaymentAttempt(sameOriginRequest(), params("invoice-1"));

    expect(response.status).toBe(403);
    expect(prepareInvoicePaymentAttempt).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin POST before touching the database", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);

    const response = await postPaymentAttempt(crossOriginRequest(), params("invoice-1"));

    expect(response.status).toBe(403);
    expect(prisma.vendorInvoice.findFirst).not.toHaveBeenCalled();
    expect(prepareInvoicePaymentAttempt).not.toHaveBeenCalled();
  });

  it("returns 404 for another vendor's invoice id, never leaking whether it exists", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);
    vi.mocked(prisma.vendorInvoice.findFirst).mockResolvedValue(null);

    const response = await postPaymentAttempt(sameOriginRequest(), params("someone-elses-invoice"));

    expect(response.status).toBe(404);
    expect(prisma.vendorInvoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "someone-elses-invoice", vendorProfileId: "vendor-001" } }),
    );
    expect(prepareInvoicePaymentAttempt).not.toHaveBeenCalled();
  });

  it("passes only the invoice ID to the service — the server, not the request body, chooses amount/recipient", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);
    vi.mocked(prisma.vendorInvoice.findFirst).mockResolvedValue({ id: "invoice-1" } as never);
    vi.mocked(prepareInvoicePaymentAttempt).mockResolvedValue({
      attemptId: "attempt-1",
      reference: "unify-inv-abc",
      status: "READY",
      accessCode: "code-x",
      authorizationUrl: "https://checkout.paystack.com/x",
      reused: false,
    });

    // Even a request body carrying a tampered amount/subaccount is ignored —
    // the route never reads request.json() at all.
    const response = await postPaymentAttempt(
      sameOriginRequest({ amountMinor: "1", subaccountCode: "ACCT_ATTACKER" }),
      params("invoice-1"),
    );

    expect(response.status).toBe(200);
    expect(prepareInvoicePaymentAttempt).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ invoiceId: "invoice-1", ownerUserId: "owner-user", config: CONFIG }),
    );
    await expect(response.json()).resolves.toEqual({
      status: "READY",
      accessCode: "code-x",
      authorizationUrl: "https://checkout.paystack.com/x",
      reference: "unify-inv-abc",
    });
  });

  it("maps a BillingDomainError (e.g. already paid) to 409 with a stable code", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);
    vi.mocked(prisma.vendorInvoice.findFirst).mockResolvedValue({ id: "invoice-1" } as never);
    vi.mocked(prepareInvoicePaymentAttempt).mockRejectedValue(new BillingDomainError("INVOICE_NOT_PAYABLE", "Already paid."));

    const response = await postPaymentAttempt(sameOriginRequest(), params("invoice-1"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: { message: "Already paid.", code: "INVOICE_NOT_PAYABLE" } });
  });

  it("rate-limits rapid repeated attempts for the same invoice", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);
    vi.mocked(prisma.vendorInvoice.findFirst).mockResolvedValue({ id: "invoice-1" } as never);
    vi.mocked(prepareInvoicePaymentAttempt).mockResolvedValue({
      attemptId: "attempt-1",
      reference: "unify-inv-abc",
      status: "READY",
      accessCode: "code-x",
      authorizationUrl: "https://checkout.paystack.com/x",
      reused: true,
    });

    const invoiceId = `invoice-rate-limit-${Math.random()}`;
    let lastResponse;
    for (let i = 0; i < 6; i += 1) {
      lastResponse = await postPaymentAttempt(sameOriginRequest(), params(invoiceId));
    }

    expect(lastResponse!.status).toBe(429);
  });
});

describe("POST /api/vendor/invoices/[invoiceId]/reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolvePaystackProviderConfig).mockReturnValue(CONFIG);
  });

  function reconcileRequest() {
    return new Request("http://localhost:3000/api/vendor/invoices/invoice-1/reconcile", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(null);

    const response = await postReconcile(reconcileRequest(), params("invoice-1"));

    expect(response.status).toBe(401);
    expect(confirmInvoicePayment).not.toHaveBeenCalled();
  });

  it("returns 403 for staff", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(null);

    const response = await postReconcile(reconcileRequest(), params("invoice-1"));

    expect(response.status).toBe(403);
  });

  it("rejects a cross-origin POST", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);

    const response = await postReconcile(
      new Request("http://localhost:3000/api/vendor/invoices/invoice-1/reconcile", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
      params("invoice-1"),
    );

    expect(response.status).toBe(403);
    expect(confirmInvoicePayment).not.toHaveBeenCalled();
  });

  it("returns 404 for another vendor's invoice", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);
    vi.mocked(prisma.vendorInvoice.findFirst).mockResolvedValue(null);

    const response = await postReconcile(reconcileRequest(), params("someone-elses-invoice"));

    expect(response.status).toBe(404);
  });

  it("reports already-settled without looking up an attempt when the invoice isn't UNPAID", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);
    vi.mocked(prisma.vendorInvoice.findFirst).mockResolvedValue({ id: "invoice-1", paymentStatus: "PAID" } as never);

    const response = await postReconcile(reconcileRequest(), params("invoice-1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ outcome: "already_settled", paymentStatus: "PAID" });
    expect(prisma.vendorInvoicePaymentAttempt.findFirst).not.toHaveBeenCalled();
  });

  it("never accepts a client-supplied reference — it resolves the invoice's own stored attempt", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);
    vi.mocked(prisma.vendorInvoice.findFirst).mockResolvedValue({ id: "invoice-1", paymentStatus: "UNPAID" } as never);
    vi.mocked(prisma.vendorInvoicePaymentAttempt.findFirst).mockResolvedValue({ reference: "unify-inv-real" } as never);
    vi.mocked(confirmInvoicePayment).mockResolvedValue({ outcome: "confirmed", invoiceId: "invoice-1", paymentId: "payment-1" });

    const response = await postReconcile(
      new Request("http://localhost:3000/api/vendor/invoices/invoice-1/reconcile", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: JSON.stringify({ reference: "unify-inv-attacker-supplied" }),
      }),
      params("invoice-1"),
    );

    expect(response.status).toBe(200);
    expect(confirmInvoicePayment).toHaveBeenCalledWith(prisma, { reference: "unify-inv-real", config: CONFIG });
    await expect(response.json()).resolves.toEqual({ outcome: "confirmed" });
  });

  it("returns 404 when there is no unresolved attempt to reconcile", async () => {
    vi.mocked(getCurrentVendorSession).mockResolvedValue(ownerSession);
    vi.mocked(getVendorInvoiceOwnerContext).mockResolvedValue(ownerContext);
    vi.mocked(prisma.vendorInvoice.findFirst).mockResolvedValue({ id: "invoice-1", paymentStatus: "UNPAID" } as never);
    vi.mocked(prisma.vendorInvoicePaymentAttempt.findFirst).mockResolvedValue(null);

    const response = await postReconcile(reconcileRequest(), params("invoice-1"));

    expect(response.status).toBe(404);
    expect(confirmInvoicePayment).not.toHaveBeenCalled();
  });
});
