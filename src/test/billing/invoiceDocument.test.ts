import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/env", () => ({ env: { VERIFICATION_FEE_CURRENCY: "ZAR", VERIFICATION_FEE_MINOR: 125 } }));

import { buildInvoiceDocumentData } from "@/lib/billing/invoiceDocument";

const baseInvoice = {
  invoiceNumber: "INV-0001",
  isDemo: false,
  documentStatus: "ISSUED",
  paymentStatus: "UNPAID",
  periodKey: "2026-08",
  currency: "ZAR",
  issuedAt: new Date("2026-09-01T00:00:00.000Z"),
  dueAt: null,
  issuerSnapshot: { name: "Example University", abbreviation: "EU", contactEmail: "billing@example.edu" },
  customerSnapshot: { companyName: "Library Cafe", contactEmail: "owner@example.com" },
  totalMinor: BigInt(900),
  platformShareMinor: BigInt(90),
  universityShareMinor: BigInt(810),
  templateVersion: 1,
};

describe("buildInvoiceDocumentData item grouping", () => {
  it("collapses many same-branch/same-period/same-price charges into one line item", () => {
    const items = Array.from({ length: 9 }, () => ({
      branchNameSnapshot: "Main Campus",
      servicePeriodKey: "2026-08",
      quantity: 1,
      unitPriceMinor: BigInt(100),
      lineTotalMinor: BigInt(100),
    }));

    const document = buildInvoiceDocumentData(baseInvoice, items);

    expect(document.items).toHaveLength(1);
    expect(document.items[0]).toMatchObject({
      branchName: "Main Campus",
      quantity: 9,
      unitPriceDisplay: "1.00",
      lineTotalDisplay: "9.00",
    });
  });

  it("keeps separate rows for different branches, periods, or unit prices", () => {
    const items = [
      { branchNameSnapshot: "Main Campus", servicePeriodKey: "2026-08", quantity: 1, unitPriceMinor: BigInt(100), lineTotalMinor: BigInt(100) },
      { branchNameSnapshot: "North Branch", servicePeriodKey: "2026-08", quantity: 1, unitPriceMinor: BigInt(100), lineTotalMinor: BigInt(100) },
      { branchNameSnapshot: "Main Campus", servicePeriodKey: "2026-07", quantity: 1, unitPriceMinor: BigInt(100), lineTotalMinor: BigInt(100) },
      { branchNameSnapshot: "Main Campus", servicePeriodKey: "2026-08", quantity: 1, unitPriceMinor: BigInt(150), lineTotalMinor: BigInt(150) },
    ];

    const document = buildInvoiceDocumentData(baseInvoice, items);

    expect(document.items).toHaveLength(4);
    expect(document.items.every((item) => item.quantity === 1)).toBe(true);
  });

  it("does not mutate the input rows while accumulating a group", () => {
    const items = [
      { branchNameSnapshot: "Main Campus", servicePeriodKey: "2026-08", quantity: 1, unitPriceMinor: BigInt(100), lineTotalMinor: BigInt(100) },
      { branchNameSnapshot: "Main Campus", servicePeriodKey: "2026-08", quantity: 1, unitPriceMinor: BigInt(100), lineTotalMinor: BigInt(100) },
    ];

    buildInvoiceDocumentData(baseInvoice, items);

    expect(items[0].quantity).toBe(1);
    expect(items[1].quantity).toBe(1);
  });
});
