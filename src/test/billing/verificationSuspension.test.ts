import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  vendorProfile: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  vendorInvoice: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/payments/posting", () => ({
  runSerializableTransaction: vi.fn((operation: (transaction: typeof database) => unknown) => operation(database)),
}));
vi.mock("@/lib/audit/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/agentClient", () => ({
  clearVendorVerificationSuspension: vi.fn(),
  setVendorVerificationSuspension: vi.fn(),
}));

import { clearVendorVerificationSuspension, setVendorVerificationSuspension } from "@/lib/agentClient";
import { writeAuditLog } from "@/lib/audit/audit";
import {
  assertVendorVerificationAllowed,
  reinstateAfterInvoicePayment,
  reinstateVerificationIfSettled,
  runVerificationSuspensionMonitor,
  suspendOverdueVendors,
  suspendVendorIfOverdue,
  syncVendorVerificationSuspensions,
} from "@/lib/billing/verificationSuspension";

const NOW = new Date("2026-10-20T10:00:00.000Z");
const DUE_AT = new Date("2026-10-15T10:00:00.000Z");

describe("suspendOverdueVendors", () => {
  beforeEach(() => vi.clearAllMocks());

  it("suspends a vendor with an overdue invoice and records why", async () => {
    database.vendorProfile.findMany.mockResolvedValue([{ id: "vendor-1" }]);
    database.vendorProfile.findUnique.mockResolvedValue({ verificationSuspensionCode: null });
    database.vendorInvoice.findMany.mockResolvedValue([
      { id: "invoice-1", invoiceNumber: "DEMO-2026-000001", dueAt: DUE_AT },
      { id: "invoice-2", invoiceNumber: "DEMO-2026-000002", dueAt: new Date("2026-10-18T10:00:00.000Z") },
    ]);

    const result = await suspendOverdueVendors(NOW);

    expect(result).toEqual({ suspended: ["vendor-1"] });
    // Grandfathered invoices (dueAt null) never match `lte`, and open exceptions pause suspension.
    expect(database.vendorProfile.findMany).toHaveBeenCalledWith({
      where: {
        verificationSuspensionCode: null,
        invoices: {
          some: { documentStatus: "ISSUED", paymentStatus: "UNPAID", dueAt: { lte: NOW }, hasUnresolvedException: false },
        },
      },
      select: { id: true },
    });
    expect(database.vendorProfile.update).toHaveBeenCalledWith({
      where: { id: "vendor-1" },
      data: {
        verificationSuspensionCode: "UNPAID_INVOICE",
        verificationSuspendedAt: NOW,
        verificationSuspensionReason: expect.stringMatching(/^Invoice DEMO-2026-000001 was due .+ \(\+1 more overdue\)$/),
        verificationAgentSyncPending: true,
      },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "VENDOR_VERIFICATION_SUSPENDED",
        actorId: null,
        targetId: "vendor-1",
        meta: expect.objectContaining({ invoiceIds: "invoice-1,invoice-2" }),
      }),
      database,
    );
  });

  it("does nothing when the invoice was paid between the scan and the transaction", async () => {
    database.vendorProfile.findMany.mockResolvedValue([{ id: "vendor-1" }]);
    database.vendorProfile.findUnique.mockResolvedValue({ verificationSuspensionCode: null });
    database.vendorInvoice.findMany.mockResolvedValue([]);

    await expect(suspendOverdueVendors(NOW)).resolves.toEqual({ suspended: [] });
    expect(database.vendorProfile.update).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("suspendVendorIfOverdue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("checks and syncs only the requested vendor", async () => {
    database.vendorProfile.findMany.mockResolvedValue([]);
    database.vendorProfile.findUnique.mockResolvedValue({
      verificationSuspensionCode: null,
      verificationSuspendedAt: null,
      verificationSuspensionReason: null,
    });

    await expect(suspendVendorIfOverdue("vendor-1", NOW)).resolves.toEqual({
      suspension: null,
      agentSync: { synced: [], failed: [] },
    });

    const [suspendScan, syncScan] = database.vendorProfile.findMany.mock.calls.map(([args]) => args.where);
    expect(suspendScan).toMatchObject({ id: "vendor-1", verificationSuspensionCode: null });
    expect(syncScan).toEqual({ verificationAgentSyncPending: true, id: "vendor-1" });
  });
});

describe("reinstateVerificationIfSettled", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lifts the suspension once no overdue invoice remains and tells the agent immediately", async () => {
    database.vendorProfile.findUnique.mockResolvedValue({
      verificationSuspensionCode: "UNPAID_INVOICE",
      verificationSuspendedAt: DUE_AT,
    });
    database.vendorInvoice.count.mockResolvedValue(0);
    database.vendorProfile.findMany.mockResolvedValue([
      { id: "vendor-1", verificationSuspensionCode: null, verificationSuspendedAt: null },
    ]);

    await expect(reinstateVerificationIfSettled("vendor-1", NOW)).resolves.toBe(true);

    expect(database.vendorProfile.update).toHaveBeenCalledWith({
      where: { id: "vendor-1" },
      data: {
        verificationSuspensionCode: null,
        verificationSuspendedAt: null,
        verificationSuspensionReason: null,
        verificationAgentSyncPending: true,
      },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VENDOR_VERIFICATION_REINSTATED", targetId: "vendor-1" }),
      database,
    );
    expect(clearVendorVerificationSuspension).toHaveBeenCalledWith("vendor-1");
  });

  it("keeps the suspension while any overdue invoice is unpaid, even one under a billing exception", async () => {
    database.vendorProfile.findUnique.mockResolvedValue({
      verificationSuspensionCode: "UNPAID_INVOICE",
      verificationSuspendedAt: DUE_AT,
    });
    database.vendorInvoice.count.mockResolvedValue(1);

    await expect(reinstateVerificationIfSettled("vendor-1", NOW)).resolves.toBe(false);

    expect(database.vendorInvoice.count).toHaveBeenCalledWith({
      where: { vendorProfileId: "vendor-1", documentStatus: "ISSUED", paymentStatus: "UNPAID", dueAt: { lte: NOW } },
    });
    expect(database.vendorProfile.update).not.toHaveBeenCalled();
    expect(clearVendorVerificationSuspension).not.toHaveBeenCalled();
  });

  it("ignores vendors that are not suspended", async () => {
    database.vendorProfile.findUnique.mockResolvedValue({ verificationSuspensionCode: null, verificationSuspendedAt: null });

    await expect(reinstateVerificationIfSettled("vendor-1", NOW)).resolves.toBe(false);
    expect(database.vendorInvoice.count).not.toHaveBeenCalled();
  });
});

describe("reinstateAfterInvoicePayment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only acts on a confirmed invoice payment", async () => {
    await reinstateAfterInvoicePayment({ outcome: "mismatch", reason: "amount" });
    await reinstateAfterInvoicePayment({ outcome: "excess", invoiceId: "invoice-1", paymentId: "payment-1" });

    expect(database.vendorInvoice.findUnique).not.toHaveBeenCalled();
  });

  it("never lets a reinstatement failure escape to the payment caller", async () => {
    database.vendorInvoice.findUnique.mockRejectedValue(new Error("db down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      reinstateAfterInvoicePayment({ outcome: "confirmed", invoiceId: "invoice-1", paymentId: "payment-1" }),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("syncVendorVerificationSuspensions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pushes suspensions to the agent and clears the flag only for the state it sent", async () => {
    database.vendorProfile.findMany.mockResolvedValue([
      { id: "vendor-1", verificationSuspensionCode: "UNPAID_INVOICE", verificationSuspendedAt: DUE_AT },
    ]);

    await expect(syncVendorVerificationSuspensions()).resolves.toEqual({ synced: ["vendor-1"], failed: [] });

    expect(setVendorVerificationSuspension).toHaveBeenCalledWith("vendor-1", {
      code: "UNPAID_INVOICE",
      suspendedAt: DUE_AT.toISOString(),
    });
    expect(database.vendorProfile.updateMany).toHaveBeenCalledWith({
      where: { id: "vendor-1", verificationAgentSyncPending: true, verificationSuspensionCode: "UNPAID_INVOICE" },
      data: { verificationAgentSyncPending: false },
    });
  });

  it("leaves the flag set when the agent is unreachable so the next run retries", async () => {
    database.vendorProfile.findMany.mockResolvedValue([
      { id: "vendor-1", verificationSuspensionCode: null, verificationSuspendedAt: null },
    ]);
    vi.mocked(clearVendorVerificationSuspension).mockRejectedValue(new Error("agent offline"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(syncVendorVerificationSuspensions()).resolves.toEqual({ synced: [], failed: ["vendor-1"] });
    expect(database.vendorProfile.updateMany).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("runVerificationSuspensionMonitor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reinstates before suspending, then syncs", async () => {
    database.vendorProfile.findMany.mockResolvedValue([]);

    await expect(runVerificationSuspensionMonitor(NOW)).resolves.toEqual({
      reinstated: [],
      suspended: [],
      agentSync: { synced: [], failed: [] },
    });

    const [reinstateScan, suspendScan, syncScan] = database.vendorProfile.findMany.mock.calls.map(([args]) => args.where);
    expect(reinstateScan).toMatchObject({ verificationSuspensionCode: "UNPAID_INVOICE" });
    expect(suspendScan).toMatchObject({ verificationSuspensionCode: null });
    expect(syncScan).toEqual({ verificationAgentSyncPending: true });
  });
});

describe("assertVendorVerificationAllowed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a suspended vendor with a coded 403", async () => {
    database.vendorProfile.findUnique.mockResolvedValue({
      verificationSuspensionCode: "UNPAID_INVOICE",
      verificationSuspendedAt: DUE_AT,
      verificationSuspensionReason: "Invoice DEMO-2026-000001 was due 15 Oct 2026",
    });

    await expect(assertVendorVerificationAllowed("vendor-1")).rejects.toMatchObject({
      code: "VENDOR_VERIFICATION_SUSPENDED",
      status: 403,
    });
  });

  it("allows a vendor in good standing", async () => {
    database.vendorProfile.findUnique.mockResolvedValue({
      verificationSuspensionCode: null,
      verificationSuspendedAt: null,
      verificationSuspensionReason: null,
    });

    await expect(assertVendorVerificationAllowed("vendor-1")).resolves.toBeUndefined();
  });
});
