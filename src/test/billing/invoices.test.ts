import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const envMock = vi.hoisted(() => ({ VERIFICATION_FEE_CURRENCY: "ZAR", VERIFICATION_FEE_MINOR: 125, VERIFICATION_INVOICING_ENABLED: true }));
vi.mock("@/lib/config/env", () => ({ env: envMock }));

import {
  isBillingPeriodClosed,
  issueInvoiceForVendorPeriod,
  previewVendorInvoiceGeneration,
  resolveNextInvoicePeriodForVendor,
  runVendorInvoiceGeneration,
  type InvoiceGenerationRunner,
  type ReadClient,
} from "@/lib/billing/invoices";

function charge(overrides: Partial<{
  servicePeriodKey: string;
  feeMinor: bigint;
  platformShareMinor: bigint;
  universityShareMinor: bigint;
  branchNameSnapshot: string;
  id: string;
}> = {}) {
  return {
    id: overrides.id ?? `charge-${Math.random()}`,
    servicePeriodKey: "2026-09",
    feeMinor: BigInt(250),
    platformShareMinor: BigInt(25),
    universityShareMinor: BigInt(225),
    branchNameSnapshot: "Main Branch",
    serviceCompletedAt: new Date("2026-09-15T10:00:00.000Z"),
    ...overrides,
  };
}

describe("isBillingPeriodClosed", () => {
  it("is not closed until the period end plus the closing delay has passed", () => {
    const periodEnd = new Date("2026-09-30T22:00:00.000Z");
    expect(isBillingPeriodClosed("2026-09", new Date(periodEnd.getTime() - 1))).toBe(false);
    expect(isBillingPeriodClosed("2026-09", periodEnd)).toBe(false); // closing delay not yet elapsed
    expect(isBillingPeriodClosed("2026-09", new Date(periodEnd.getTime() + 3600_000))).toBe(true);
  });
});

describe("resolveNextInvoicePeriodForVendor", () => {
  const now = new Date("2026-10-02T00:00:00.000Z");

  function client(overrides: { lastInvoicePeriodKey?: string | null; earliestUnclaimedPeriodKey?: string | null }) {
    return {
      vendorInvoice: {
        findFirst: vi.fn().mockResolvedValue(
          overrides.lastInvoicePeriodKey ? { periodKey: overrides.lastInvoicePeriodKey } : null,
        ),
      },
      verificationCharge: {
        findFirst: vi.fn().mockResolvedValue(
          overrides.earliestUnclaimedPeriodKey ? { servicePeriodKey: overrides.earliestUnclaimedPeriodKey } : null,
        ),
      },
    } as unknown as ReadClient;
  }

  it("returns null when there is no unclaimed charge at all", async () => {
    const result = await resolveNextInvoicePeriodForVendor(
      client({ earliestUnclaimedPeriodKey: null }),
      "vendor-001",
      "ZAR",
      now,
    );
    expect(result).toBeNull();
  });

  it("targets the earliest unclaimed period for a first-ever invoice", async () => {
    const result = await resolveNextInvoicePeriodForVendor(
      client({ lastInvoicePeriodKey: null, earliestUnclaimedPeriodKey: "2026-09" }),
      "vendor-001",
      "ZAR",
      now,
    );
    expect(result).toBe("2026-09");
  });

  it("returns null when the earliest unclaimed period has not closed yet", async () => {
    const result = await resolveNextInvoicePeriodForVendor(
      client({ earliestUnclaimedPeriodKey: "2026-10" }),
      "vendor-001",
      "ZAR",
      now,
    );
    expect(result).toBeNull();
  });

  it("targets the period right after the last invoice in the normal case", async () => {
    const result = await resolveNextInvoicePeriodForVendor(
      client({ lastInvoicePeriodKey: "2026-08", earliestUnclaimedPeriodKey: "2026-09" }),
      "vendor-001",
      "ZAR",
      now,
    );
    expect(result).toBe("2026-09");
  });

  it("skips a genuinely empty gap straight to the earliest real unclaimed period", async () => {
    // Vendor's last invoice was July; August had zero activity; the only
    // unclaimed charge is from September. Must not target August.
    const result = await resolveNextInvoicePeriodForVendor(
      client({ lastInvoicePeriodKey: "2026-07", earliestUnclaimedPeriodKey: "2026-09" }),
      "vendor-001",
      "ZAR",
      now,
    );
    expect(result).toBe("2026-09");
  });

  it("sweeps a late straggler from an already-invoiced period into the next period", async () => {
    // Last invoice already covered up to and including July; a late charge
    // stamped "2026-07" still shows up unclaimed. Target must be August
    // (the period after the last invoice), not July again.
    const result = await resolveNextInvoicePeriodForVendor(
      client({ lastInvoicePeriodKey: "2026-07", earliestUnclaimedPeriodKey: "2026-07" }),
      "vendor-001",
      "ZAR",
      now,
    );
    expect(result).toBe("2026-08");
  });
});

describe("issueInvoiceForVendorPeriod", () => {
  function makeDb(charges: ReturnType<typeof charge>[]) {
    const tx = {
      verificationCharge: { findMany: vi.fn().mockResolvedValue(charges) },
      vendorProfile: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ companyName: "Library Cafe", contactEmail: "cafe@example.test" }),
      },
      universityProfile: {
        findFirstOrThrow: vi.fn().mockResolvedValue({ name: "UNIFY U", abbreviation: "UU", contactEmail: "admin@example.test" }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: BigInt(1) }]),
      vendorInvoice: {
        create: vi.fn().mockResolvedValue({ id: "invoice-001" }),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "invoice-001", ...data })),
      },
      vendorInvoiceItem: { createMany: vi.fn().mockResolvedValue({ count: charges.length }) },
    };
    const db = {
      $transaction: vi.fn((fn: (transaction: typeof tx) => unknown) => fn(tx)),
    } as unknown as InvoiceGenerationRunner;
    return { tx, db };
  }

  it("returns null and writes nothing when there is no eligible charge", async () => {
    const { db, tx } = makeDb([]);

    const result = await issueInvoiceForVendorPeriod(db, { vendorProfileId: "vendor-001", periodKey: "2026-09" });

    expect(result).toBeNull();
    expect(tx.vendorInvoice.create).not.toHaveBeenCalled();
  });

  it("creates the invoice, its items, and issues it with the correct totals", async () => {
    const charges = [
      charge({ id: "charge-1", feeMinor: BigInt(250), platformShareMinor: BigInt(25), universityShareMinor: BigInt(225) }),
      charge({ id: "charge-2", feeMinor: BigInt(100), platformShareMinor: BigInt(10), universityShareMinor: BigInt(90) }),
    ];
    const now = new Date("2026-10-05T12:00:00.000Z");
    const { db, tx } = makeDb(charges);

    const result = await issueInvoiceForVendorPeriod(db, {
      vendorProfileId: "vendor-001",
      periodKey: "2026-09",
      now,
    });

    expect(tx.vendorInvoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceNumber: "DEMO-2026-000001",
        vendorProfileId: "vendor-001",
        periodKey: "2026-09",
        currency: "ZAR",
        totalMinor: BigInt(350),
        platformShareMinor: BigInt(35),
        universityShareMinor: BigInt(315),
        isDemo: true,
      }),
    });
    expect(tx.vendorInvoiceItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ invoiceId: "invoice-001", chargeId: "charge-1", unitPriceMinor: BigInt(250) }),
        expect.objectContaining({ invoiceId: "invoice-001", chargeId: "charge-2", unitPriceMinor: BigInt(100) }),
      ],
    });
    expect(tx.vendorInvoice.update).toHaveBeenCalledWith({
      where: { id: "invoice-001" },
      data: expect.objectContaining({ documentStatus: "ISSUED", issuedAt: now, paymentStatus: "UNPAID" }),
    });
    expect(result).toMatchObject({ documentStatus: "ISSUED" });
  });

  it("marks a zero-total invoice as NO_PAYMENT_REQUIRED", async () => {
    const charges = [charge({ feeMinor: BigInt(0), platformShareMinor: BigInt(0), universityShareMinor: BigInt(0) })];
    const { db, tx } = makeDb(charges);

    await issueInvoiceForVendorPeriod(db, { vendorProfileId: "vendor-001", periodKey: "2026-09" });

    expect(tx.vendorInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: "NO_PAYMENT_REQUIRED" }) }),
    );
  });

  it("resolves a concurrent unique-constraint race to null instead of throwing", async () => {
    const db = { $transaction: vi.fn().mockRejectedValue({ code: "P2002" }) } as unknown as InvoiceGenerationRunner;

    const result = await issueInvoiceForVendorPeriod(db, { vendorProfileId: "vendor-001", periodKey: "2026-09" });

    expect(result).toBeNull();
  });
});

describe("previewVendorInvoiceGeneration and runVendorInvoiceGeneration", () => {
  it("preview reports a multi-month backlog as separate invoices without writing anything", async () => {
    const now = new Date("2026-11-02T00:00:00.000Z");
    const client = {
      verificationCharge: {
        findMany: vi.fn().mockImplementation(({ distinct }: { distinct?: string[] }) => {
          if (distinct) return Promise.resolve([{ vendorProfileId: "vendor-001" }]);
          return Promise.resolve([
            charge({ servicePeriodKey: "2026-09", feeMinor: BigInt(100), platformShareMinor: BigInt(10), universityShareMinor: BigInt(90) }),
            charge({ servicePeriodKey: "2026-10", feeMinor: BigInt(200), platformShareMinor: BigInt(20), universityShareMinor: BigInt(180) }),
          ]);
        }),
      },
      vendorInvoice: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as ReadClient;

    const previews = await previewVendorInvoiceGeneration(client, { now });

    expect(previews).toEqual([
      expect.objectContaining({ vendorProfileId: "vendor-001", periodKey: "2026-09", chargeCount: 1, totalMinor: BigInt(100) }),
      expect.objectContaining({ vendorProfileId: "vendor-001", periodKey: "2026-10", chargeCount: 1, totalMinor: BigInt(200) }),
    ]);
  });

  it("run issues one invoice per vendor per closed period until nothing remains", async () => {
    // A tiny in-memory fake standing in for the database: one vendor with a
    // single closed-period charge. Issuing it should claim the charge, so a
    // second pass through the generation loop finds nothing left to do.
    const now = new Date("2026-10-05T00:00:00.000Z");
    let invoiceCounter = 0;
    const state = {
      unclaimedCharges: [charge({ servicePeriodKey: "2026-09" })],
      invoices: [] as Array<{ periodKey: string }>,
    };

    const db = {
      verificationCharge: {
        findMany: vi.fn().mockImplementation(({ distinct }: { distinct?: string[] }) => {
          if (distinct) {
            return Promise.resolve(
              state.unclaimedCharges.length > 0 ? [{ vendorProfileId: "vendor-001" }] : [],
            );
          }
          return Promise.resolve(state.unclaimedCharges);
        }),
        findFirst: vi.fn().mockImplementation(() =>
          Promise.resolve(
            state.unclaimedCharges.length > 0 ? { servicePeriodKey: state.unclaimedCharges[0].servicePeriodKey } : null,
          ),
        ),
      },
      vendorInvoice: {
        findFirst: vi.fn().mockImplementation(() => {
          const sorted = [...state.invoices].sort((a, b) => b.periodKey.localeCompare(a.periodKey));
          return Promise.resolve(sorted[0] ?? null);
        }),
        create: vi.fn().mockImplementation(({ data }) => {
          invoiceCounter += 1;
          return Promise.resolve({ id: `invoice-${invoiceCounter}`, periodKey: data.periodKey });
        }),
        update: vi.fn().mockImplementation(({ data, where }) => {
          state.invoices.push({ periodKey: "2026-09" });
          state.unclaimedCharges = []; // the update call marks the batch as claimed
          return Promise.resolve({ id: where.id, totalMinor: BigInt(250), ...data });
        }),
      },
      vendorProfile: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ companyName: "Library Cafe", contactEmail: "cafe@example.test" }),
      },
      universityProfile: {
        findFirstOrThrow: vi.fn().mockResolvedValue({ name: "UNIFY U", abbreviation: "UU", contactEmail: "admin@example.test" }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: BigInt(1) }]),
      vendorInvoiceItem: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    (db as unknown as { $transaction: unknown }).$transaction = vi.fn((fn: (tx: typeof db) => unknown) => fn(db));

    const summary = await runVendorInvoiceGeneration(db as never, { now });

    expect(summary.vendorsScanned).toBe(1);
    expect(summary.invoicesIssued).toBe(1);
    expect(db.vendorInvoiceItem.createMany).toHaveBeenCalledTimes(1);
  });

  it("does nothing and reports skippedDisabled when VERIFICATION_INVOICING_ENABLED is off, without even reading unclaimed charges", async () => {
    const findManySpy = vi.fn();
    const db = { verificationCharge: { findMany: findManySpy } } as unknown as InvoiceGenerationRunner;

    envMock.VERIFICATION_INVOICING_ENABLED = false;
    try {
      const summary = await runVendorInvoiceGeneration(db);
      expect(summary).toEqual({ vendorsScanned: 0, invoicesIssued: 0, zeroTotalInvoices: 0, skippedDisabled: true });
      expect(findManySpy).not.toHaveBeenCalled();
    } finally {
      envMock.VERIFICATION_INVOICING_ENABLED = true;
    }
  });
});
