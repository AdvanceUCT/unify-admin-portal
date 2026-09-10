import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/config/env", () => ({ env: { VERIFICATION_FEE_CURRENCY: "ZAR", VERIFICATION_FEE_MINOR: 125 } }));
vi.mock("@/lib/billing/vendorAuthorization", () => ({ requireVendorInvoiceOwnerContext: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/billing/demoSeed", () => ({
  seedVerificationHistoryForVendor: vi.fn(),
  DEFAULT_SEED_COUNT_PER_VENDOR: 12,
  DEFAULT_SEED_MONTHS_BACK: 3,
}));
vi.mock("@/lib/billing/backfill", () => ({ runVerificationBillingBackfill: vi.fn() }));
vi.mock("@/lib/billing/invoices", () => ({ runVendorInvoiceGenerationForVendor: vi.fn() }));

import { requireVendorInvoiceOwnerContext } from "@/lib/billing/vendorAuthorization";
import { seedVerificationHistoryForVendor } from "@/lib/billing/demoSeed";
import { runVerificationBillingBackfill } from "@/lib/billing/backfill";
import { runVendorInvoiceGenerationForVendor } from "@/lib/billing/invoices";
import { prisma } from "@/lib/db/prisma";
import { generateOwnInvoicesAction, seedOwnVerificationHistoryAction } from "@/app/vendor/(portal)/test-tools/actions";

const ownerContext = { session: { user: { id: "owner-user" } }, context: { userId: "owner-user", vendorProfileId: "vendor-001", companyName: "Library Cafe" } };

describe("seedOwnVerificationHistoryAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an active owner", async () => {
    vi.mocked(requireVendorInvoiceOwnerContext).mockRejectedValue(new Error("forbidden"));

    await expect(seedOwnVerificationHistoryAction()).rejects.toThrow("forbidden");
    expect(seedVerificationHistoryForVendor).not.toHaveBeenCalled();
  });

  it("scopes seeding to the signed-in owner's own vendor only — never accepts a vendor ID as input", async () => {
    vi.mocked(requireVendorInvoiceOwnerContext).mockResolvedValue(ownerContext as never);
    vi.mocked(seedVerificationHistoryForVendor).mockResolvedValue(7);

    const result = await seedOwnVerificationHistoryAction(7, 2);

    expect(seedVerificationHistoryForVendor).toHaveBeenCalledWith(prisma, { vendorProfileId: "vendor-001", count: 7, monthsBack: 2 });
    expect(result).toEqual({ created: 7 });
  });

  it("falls back to the shared defaults when no count/monthsBack is passed", async () => {
    vi.mocked(requireVendorInvoiceOwnerContext).mockResolvedValue(ownerContext as never);
    vi.mocked(seedVerificationHistoryForVendor).mockResolvedValue(12);

    await seedOwnVerificationHistoryAction();

    expect(seedVerificationHistoryForVendor).toHaveBeenCalledWith(prisma, { vendorProfileId: "vendor-001", count: 12, monthsBack: 3 });
  });
});

describe("generateOwnInvoicesAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an active owner", async () => {
    vi.mocked(requireVendorInvoiceOwnerContext).mockRejectedValue(new Error("forbidden"));

    await expect(generateOwnInvoicesAction()).rejects.toThrow("forbidden");
    expect(runVerificationBillingBackfill).not.toHaveBeenCalled();
    expect(runVendorInvoiceGenerationForVendor).not.toHaveBeenCalled();
  });

  it("runs backfill then invoice generation scoped to the signed-in owner's own vendor only", async () => {
    vi.mocked(requireVendorInvoiceOwnerContext).mockResolvedValue(ownerContext as never);
    vi.mocked(runVerificationBillingBackfill).mockResolvedValue({
      scanned: 5, imported: 5, alreadyImported: 0, notBillable: 0, pending: 0, exceptions: 0, nextCursor: null,
    });
    vi.mocked(runVendorInvoiceGenerationForVendor).mockResolvedValue({
      vendorsScanned: 1, invoicesIssued: 2, zeroTotalInvoices: 0, skippedDisabled: false,
    });

    const result = await generateOwnInvoicesAction();

    expect(runVerificationBillingBackfill).toHaveBeenCalledWith(prisma, { apply: true, vendorProfileId: "vendor-001" });
    expect(runVendorInvoiceGenerationForVendor).toHaveBeenCalledWith(prisma, "vendor-001", { now: expect.any(Date) });
    expect(result.backfill.imported).toBe(5);
    expect(result.invoices.invoicesIssued).toBe(2);
  });

  it("forces the current billing period closed so freshly-seeded current-month history is invoiceable immediately", async () => {
    vi.mocked(requireVendorInvoiceOwnerContext).mockResolvedValue(ownerContext as never);
    vi.mocked(runVerificationBillingBackfill).mockResolvedValue({
      scanned: 1, imported: 1, alreadyImported: 0, notBillable: 0, pending: 0, exceptions: 0, nextCursor: null,
    });
    vi.mocked(runVendorInvoiceGenerationForVendor).mockResolvedValue({
      vendorsScanned: 1, invoicesIssued: 1, zeroTotalInvoices: 0, skippedDisabled: false,
    });

    await generateOwnInvoicesAction();

    const passedNow = vi.mocked(runVendorInvoiceGenerationForVendor).mock.calls[0][2]?.now;
    expect(passedNow).toBeInstanceOf(Date);
    // Must be safely in the future relative to real "now" — otherwise it wouldn't force-close the current period at all.
    expect(passedNow!.getTime()).toBeGreaterThan(Date.now());
  });
});
