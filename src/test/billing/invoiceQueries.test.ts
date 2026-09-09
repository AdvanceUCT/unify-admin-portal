import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/env", () => ({ env: { VERIFICATION_FEE_CURRENCY: "ZAR", VERIFICATION_FEE_MINOR: 125 } }));

const database = vi.hoisted(() => ({
  vendorInvoice: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  billingException: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));

import { getAdminInvoiceDetail, getVendorInvoiceDocument } from "@/lib/billing/invoiceQueries";

function baseInvoice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "invoice-1",
    vendorProfileId: "vendor-1",
    documentStatus: "ISSUED",
    paymentStatus: "UNPAID",
    hasUnresolvedException: false,
    totalMinor: BigInt(1000),
    platformShareMinor: BigInt(100),
    universityShareMinor: BigInt(900),
    currency: "ZAR",
    invoiceNumber: "DEMO-2026-000001",
    periodKey: "2026-09",
    issuerSnapshot: { name: "UNIFY U", abbreviation: "UU", contactEmail: "admin@example.test" },
    customerSnapshot: { companyName: "Library Cafe", contactEmail: "cafe@example.test" },
    isDemo: true,
    templateVersion: 1,
    issuedAt: new Date("2026-09-05T00:00:00.000Z"),
    dueAt: null,
    items: [],
    ...overrides,
  };
}

describe("getVendorInvoiceDocument isPayable", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is payable when issued, unpaid, positive total, and no unresolved exception", async () => {
    database.vendorInvoice.findFirst.mockResolvedValue(baseInvoice());

    const result = await getVendorInvoiceDocument("vendor-1", "invoice-1");
    expect(result?.isPayable).toBe(true);
  });

  it.each([
    ["DRAFT documentStatus", { documentStatus: "DRAFT" }],
    ["already paid", { paymentStatus: "PAID" }],
    ["zero total", { totalMinor: BigInt(0) }],
    ["unresolved exception", { hasUnresolvedException: true }],
  ])("is not payable when %s", async (_label, overrides) => {
    database.vendorInvoice.findFirst.mockResolvedValue(baseInvoice(overrides));

    const result = await getVendorInvoiceDocument("vendor-1", "invoice-1");
    expect(result?.isPayable).toBe(false);
  });

  it("returns null for a missing or wrong-vendor invoice", async () => {
    database.vendorInvoice.findFirst.mockResolvedValue(null);

    await expect(getVendorInvoiceDocument("vendor-1", "invoice-1")).resolves.toBeNull();
  });
});

describe("getAdminInvoiceDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null for a missing invoice", async () => {
    database.vendorInvoice.findUnique.mockResolvedValue(null);

    await expect(getAdminInvoiceDetail("invoice-1")).resolves.toBeNull();
  });

  it("shapes attempts, payments, and exceptions for the admin view", async () => {
    database.vendorInvoice.findUnique.mockResolvedValue({
      ...baseInvoice(),
      vendorProfile: { companyName: "Library Cafe" },
      paymentAttempts: [
        {
          id: "attempt-1",
          status: "SUCCEEDED",
          reference: "unify-inv-abc",
          expectedAmountMinor: BigInt(1000),
          currency: "ZAR",
          createdAt: new Date("2026-09-05T00:00:00.000Z"),
          updatedAt: new Date("2026-09-05T00:05:00.000Z"),
          providerTransactionId: "txn-1",
          payment: {
            id: "payment-1",
            providerTransactionId: "txn-1",
            grossAmountMinor: BigInt(1000),
            currency: "ZAR",
            paidAt: new Date("2026-09-05T00:05:00.000Z"),
            allocation: { id: "allocation-1" },
          },
        },
        {
          id: "attempt-2",
          status: "FAILED",
          reference: "unify-inv-def",
          expectedAmountMinor: BigInt(1000),
          currency: "ZAR",
          createdAt: new Date("2026-09-04T00:00:00.000Z"),
          updatedAt: new Date("2026-09-04T00:01:00.000Z"),
          providerTransactionId: null,
          payment: null,
        },
      ],
    });
    database.billingException.findMany.mockResolvedValue([
      { id: "exception-1", type: "PAYMENT_MISMATCH", resolved: false, createdAt: new Date("2026-09-04T00:02:00.000Z"), details: { reason: "amount" } },
    ]);

    const result = await getAdminInvoiceDetail("invoice-1");

    expect(result?.vendorCompanyName).toBe("Library Cafe");
    expect(result?.attempts).toHaveLength(2);
    expect(result?.attempts[0]).toMatchObject({ id: "attempt-1", status: "SUCCEEDED", reference: "unify-inv-abc" });
    expect(result?.payments).toEqual([
      { id: "payment-1", providerTransactionId: "txn-1", grossAmountDisplay: "10.00", paidAtIso: "2026-09-05T00:05:00.000Z" },
    ]);
    expect(result?.exceptions).toEqual([
      { id: "exception-1", type: "PAYMENT_MISMATCH", resolved: false, createdAtIso: "2026-09-04T00:02:00.000Z", details: { reason: "amount" } },
    ]);
  });
});
