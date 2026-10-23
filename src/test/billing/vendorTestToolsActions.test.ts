import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/config/env", () => ({ env: { VERIFICATION_FEE_CURRENCY: "ZAR", VERIFICATION_FEE_MINOR: 125 } }));
vi.mock("@/lib/billing/vendorAuthorization", () => ({ requireVendorInvoiceOwnerContext: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/billing/verificationSuspension", () => ({ suspendVendorIfOverdue: vi.fn() }));
vi.mock("@/lib/billing/demoSeed", () => ({
  seedVerificationHistoryForVendor: vi.fn(),
  seedMonthOptions: vi.fn(() => [
    { periodKey: "2026-10", label: "October 2026" },
    { periodKey: "2026-09", label: "September 2026" },
    { periodKey: "2026-08", label: "August 2026" },
  ]),
  DEFAULT_SEED_COUNT_PER_VENDOR: 12,
}));
vi.mock("@/lib/billing/backfill", () => ({ runVerificationBillingBackfill: vi.fn() }));
vi.mock("@/lib/billing/invoices", () => ({ runVendorInvoiceGenerationForVendor: vi.fn() }));

import { requireVendorInvoiceOwnerContext } from "@/lib/billing/vendorAuthorization";
import { seedVerificationHistoryForVendor } from "@/lib/billing/demoSeed";
import { runVerificationBillingBackfill } from "@/lib/billing/backfill";
import { runVendorInvoiceGenerationForVendor } from "@/lib/billing/invoices";
import { prisma } from "@/lib/db/prisma";
import { suspendVendorIfOverdue } from "@/lib/billing/verificationSuspension";
import { generateOwnInvoicesAction, seedOwnVerificationHistoryAction } from "@/app/vendor/(portal)/test-tools/actions";

const ownerContext = { session: { user: { id: "owner-user" } }, context: { userId: "owner-user", vendorProfileId: "vendor-001", companyName: "Library Cafe" } };

describe("seedOwnVerificationHistoryAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an active owner", async () => {
    vi.mocked(requireVendorInvoiceOwnerContext).mockRejectedValue(new Error("forbidden"));

    await expect(seedOwnVerificationHistoryAction(12, ["2026-09"])).rejects.toThrow("forbidden");
    expect(seedVerificationHistoryForVendor).not.toHaveBeenCalled();
  });

  it("scopes seeding to the signed-in owner's own vendor only — never accepts a vendor ID as input", async () => {
    vi.mocked(requireVendorInvoiceOwnerContext).mockResolvedValue(ownerContext as never);
    vi.mocked(seedVerificationHistoryForVendor).mockResolvedValue(7);

    const result = await seedOwnVerificationHistoryAction(7, ["2026-08", "2026-10"]);

    expect(seedVerificationHistoryForVendor).toHaveBeenCalledWith(prisma, {
      vendorProfileId: "vendor-001",
      count: 7,
      periodKeys: ["2026-08", "2026-10"],
    });
    expect(result).toEqual({ created: 7 });
  });

  it("falls back to the shared default count when none is passed", async () => {
    vi.mocked(requireVendorInvoiceOwnerContext).mockResolvedValue(ownerContext as never);
    vi.mocked(seedVerificationHistoryForVendor).mockResolvedValue(12);

    await seedOwnVerificationHistoryAction(undefined, ["2026-09"]);

    expect(seedVerificationHistoryForVendor).toHaveBeenCalledWith(prisma, { vendorProfileId: "vendor-001", count: 12, periodKeys: ["2026-09"] });
  });

  it("rejects months outside January to the current month, and an empty selection", async () => {
    vi.mocked(requireVendorInvoiceOwnerContext).mockResolvedValue(ownerContext as never);

    await expect(seedOwnVerificationHistoryAction(5, ["2026-11"])).rejects.toThrow(/January up to the current month/);
    await expect(seedOwnVerificationHistoryAction(5, ["2025-12"])).rejects.toThrow(/January up to the current month/);
    await expect(seedOwnVerificationHistoryAction(5, [])).rejects.toThrow(/at least one month/);
    expect(seedVerificationHistoryForVendor).not.toHaveBeenCalled();
  });
});

describe("generateOwnInvoicesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(suspendVendorIfOverdue).mockResolvedValue({ suspension: null, agentSync: { synced: [], failed: [] } });
  });

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
    expect(runVendorInvoiceGenerationForVendor).toHaveBeenCalledWith(prisma, "vendor-001", {
      now: expect.any(Date),
      issueAtPeriodClose: true,
    });
    expect(suspendVendorIfOverdue).toHaveBeenCalledWith("vendor-001");
    expect(result.verificationSuspended).toBe(false);
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
