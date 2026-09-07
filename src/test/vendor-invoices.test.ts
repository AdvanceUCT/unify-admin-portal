import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getVendorCurrentInvoice,
  getVendorInvoiceSummary,
  initiateInvoicePayment,
} from "@/lib/billing/invoiceService";

const database = vi.hoisted(() => ({
  vendorInvoice: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}));

const paystack = vi.hoisted(() => ({
  initializeTransaction: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/payments/paystackService", () => ({ initializeTransaction: paystack.initializeTransaction }));
vi.mock("@/lib/config/env", () => ({ env: { APP_URL: "http://localhost:3000" } }));
vi.mock("@/lib/email/vendor-invoice-notification", () => ({ sendVendorInvoiceNotificationEmail: vi.fn() }));
vi.mock("@/lib/audit/audit", () => ({ writeAuditLog: vi.fn() }));

function invoice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "invoice-1",
    vendorProfileId: "vendor-1",
    vendorName: "Acme Verifiers",
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-07-31T23:59:59.999Z"),
    verificationCount: 10,
    ratePerVerification: 500,
    totalCents: 5000,
    status: "UNPAID",
    dueDate: new Date("2026-08-30T00:00:00.000Z"),
    paidAt: null,
    paystackReference: null,
    ...overrides,
  };
}

describe("getVendorCurrentInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries only unpaid or flagged invoices for the vendor, most recent period first", async () => {
    database.vendorInvoice.findFirst.mockResolvedValue(null);

    await getVendorCurrentInvoice("vendor-1");

    expect(database.vendorInvoice.findFirst).toHaveBeenCalledWith({
      where: { vendorProfileId: "vendor-1", status: { in: ["UNPAID", "FLAGGED"] } },
      orderBy: { periodEnd: "desc" },
    });
  });
});

describe("getVendorInvoiceSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sums paid and unpaid totals and picks the latest unpaid/flagged invoice as current", async () => {
    database.vendorInvoice.findMany.mockResolvedValue([
      invoice({ id: "paid-1", status: "PAID", totalCents: 2000 }),
      invoice({
        id: "unpaid-older",
        status: "UNPAID",
        totalCents: 3000,
        periodEnd: new Date("2026-06-30T23:59:59.999Z"),
      }),
      invoice({
        id: "flagged-newer",
        status: "FLAGGED",
        totalCents: 5000,
        periodEnd: new Date("2026-07-31T23:59:59.999Z"),
      }),
    ]);

    const summary = await getVendorInvoiceSummary("vendor-1");

    expect(summary.totalPaidCents).toBe(2000);
    expect(summary.totalUnpaidCents).toBe(8000);
    expect(summary.invoiceCount).toBe(3);
    expect(summary.currentInvoice?.id).toBe("flagged-newer");
  });

  it("returns a null current invoice when every invoice is paid", async () => {
    database.vendorInvoice.findMany.mockResolvedValue([invoice({ status: "PAID" })]);

    const summary = await getVendorInvoiceSummary("vendor-1");

    expect(summary.currentInvoice).toBeNull();
    expect(summary.totalUnpaidCents).toBe(0);
  });
});

describe("initiateInvoicePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when the invoice does not exist", async () => {
    database.vendorInvoice.findUnique.mockResolvedValue(null);

    await expect(initiateInvoicePayment("missing", "vendor-1", "vendor@example.com")).rejects.toThrow(
      "Invoice not found.",
    );
    expect(paystack.initializeTransaction).not.toHaveBeenCalled();
  });

  it("throws Unauthorized when the invoice belongs to a different vendor", async () => {
    database.vendorInvoice.findUnique.mockResolvedValue(invoice({ vendorProfileId: "other-vendor" }));

    await expect(initiateInvoicePayment("invoice-1", "vendor-1", "vendor@example.com")).rejects.toThrow(
      "Unauthorized",
    );
    expect(paystack.initializeTransaction).not.toHaveBeenCalled();
  });

  it("throws when the invoice is already paid", async () => {
    database.vendorInvoice.findUnique.mockResolvedValue(invoice({ status: "PAID" }));

    await expect(initiateInvoicePayment("invoice-1", "vendor-1", "vendor@example.com")).rejects.toThrow(
      "Invoice is already paid",
    );
    expect(paystack.initializeTransaction).not.toHaveBeenCalled();
  });

  it("throws when the invoice has nothing due", async () => {
    database.vendorInvoice.findUnique.mockResolvedValue(invoice({ totalCents: 0 }));

    await expect(initiateInvoicePayment("invoice-1", "vendor-1", "vendor@example.com")).rejects.toThrow(
      "Invoice has no amount due.",
    );
  });

  it("initializes a Paystack transaction for the invoice's exact amount and returns the checkout URL", async () => {
    database.vendorInvoice.findUnique.mockResolvedValue(invoice());
    paystack.initializeTransaction.mockResolvedValue({
      authorizationUrl: "https://checkout.paystack.com/abc123",
      accessCode: "abc123",
      reference: "generated-reference",
    });

    const result = await initiateInvoicePayment("invoice-1", "vendor-1", "vendor@example.com");

    expect(paystack.initializeTransaction).toHaveBeenCalledTimes(1);
    const call = paystack.initializeTransaction.mock.calls[0]?.[0];
    expect(call.amountCents).toBe(5000);
    expect(call.email).toBe("vendor@example.com");
    expect(call.callbackUrl).toContain("/api/vendor/invoices/callback");
    expect(call.metadata).toMatchObject({
      invoiceId: "invoice-1",
      vendorProfileId: "vendor-1",
      type: "INVOICE_PAYMENT",
    });
    expect(result.authorizationUrl).toBe("https://checkout.paystack.com/abc123");
    expect(result.reference).toMatch(/^inv-invoice-1-\d+$/);
    expect(result.reference).toBe(call.reference);
  });

  it("allows paying a flagged invoice, not just an unpaid one", async () => {
    database.vendorInvoice.findUnique.mockResolvedValue(invoice({ status: "FLAGGED" }));
    paystack.initializeTransaction.mockResolvedValue({
      authorizationUrl: "https://checkout.paystack.com/abc123",
      accessCode: "abc123",
      reference: "generated-reference",
    });

    await expect(initiateInvoicePayment("invoice-1", "vendor-1", "vendor@example.com")).resolves.toBeDefined();
  });
});
