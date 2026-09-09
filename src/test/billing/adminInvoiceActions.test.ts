import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/audit/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/billing/invoices", () => ({ runVendorInvoiceGeneration: vi.fn() }));
vi.mock("@/lib/billing/paymentConfirmation", () => ({ confirmInvoicePayment: vi.fn() }));
vi.mock("@/lib/paymentProviders/paystack/config", () => ({ resolvePaystackProviderConfig: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { vendorInvoicePaymentAttempt: { findFirst: vi.fn() } },
}));

import { requireRole } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/audit";
import { runVendorInvoiceGeneration } from "@/lib/billing/invoices";
import { confirmInvoicePayment } from "@/lib/billing/paymentConfirmation";
import { resolvePaystackProviderConfig } from "@/lib/paymentProviders/paystack/config";
import { prisma } from "@/lib/db/prisma";
import { generateMissingInvoicesAction } from "@/app/(admin)/vendors/invoices/actions";
import { reconcileInvoicePaymentAction } from "@/app/(admin)/vendors/invoices/[invoiceId]/actions";

const adminSession = { user: { id: "admin-1", role: "ADMIN" } } as Awaited<ReturnType<typeof requireRole>>;
const CONFIG = {
  secretKey: "sk_test_fixture",
  mode: "test",
  accountRef: "university-demo",
  subaccountCode: "ACCT_X",
  expectedIntegrationId: "2001638",
  baseUrl: "https://api.paystack.example",
};

describe("generateMissingInvoicesAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires SUPER_ADMIN/ADMIN and invoice:issue before running generation", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));

    await expect(generateMissingInvoicesAction()).rejects.toThrow("Forbidden");
    expect(runVendorInvoiceGeneration).not.toHaveBeenCalled();
  });

  it("throws a clear message instead of silently doing nothing when invoicing is disabled", async () => {
    vi.mocked(requireRole).mockResolvedValue(adminSession);
    vi.mocked(runVendorInvoiceGeneration).mockResolvedValue({
      vendorsScanned: 0,
      invoicesIssued: 0,
      zeroTotalInvoices: 0,
      skippedDisabled: true,
    });

    await expect(generateMissingInvoicesAction()).rejects.toThrow(/disabled/i);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("runs generation, writes an audit log with counts, and revalidates the list", async () => {
    vi.mocked(requireRole).mockResolvedValue(adminSession);
    vi.mocked(runVendorInvoiceGeneration).mockResolvedValue({
      vendorsScanned: 3,
      invoicesIssued: 2,
      zeroTotalInvoices: 1,
      skippedDisabled: false,
    });

    await generateMissingInvoicesAction();

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "INVOICE_GENERATION_TRIGGERED",
        actorId: "admin-1",
        meta: { vendorsScanned: 3, invoicesIssued: 2, zeroTotalInvoices: 1 },
      }),
    );
  });
});

describe("reconcileInvoicePaymentAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires SUPER_ADMIN/ADMIN and invoice:reconcile", async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error("Forbidden"));

    await expect(reconcileInvoicePaymentAction("invoice-1")).rejects.toThrow("Forbidden");
    expect(confirmInvoicePayment).not.toHaveBeenCalled();
  });

  it("throws when there is no unresolved attempt to reconcile", async () => {
    vi.mocked(requireRole).mockResolvedValue(adminSession);
    vi.mocked(prisma.vendorInvoicePaymentAttempt.findFirst).mockResolvedValue(null);

    await expect(reconcileInvoicePaymentAction("invoice-1")).rejects.toThrow(/no unresolved payment attempt/i);
  });

  it("resolves the invoice's own attempt, confirms it, and writes an audit log — never the vendor's own Pay action", async () => {
    vi.mocked(requireRole).mockResolvedValue(adminSession);
    vi.mocked(prisma.vendorInvoicePaymentAttempt.findFirst).mockResolvedValue({ reference: "unify-inv-abc" } as never);
    vi.mocked(resolvePaystackProviderConfig).mockReturnValue(CONFIG);
    vi.mocked(confirmInvoicePayment).mockResolvedValue({ outcome: "confirmed", invoiceId: "invoice-1", paymentId: "payment-1" });

    await reconcileInvoicePaymentAction("invoice-1");

    expect(confirmInvoicePayment).toHaveBeenCalledWith(prisma, { reference: "unify-inv-abc", config: CONFIG });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "INVOICE_PAYMENT_RECONCILED", actorId: "admin-1", targetId: "invoice-1", meta: { outcome: "confirmed" } }),
    );
  });
});
