// @vitest-environment node
// Database behaviour of the overdue-invoice verification suspension
// (docs/vendor-verification-suspension-plan.md): issue → overdue → suspend → pay → reinstate.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/env", () => ({ env: { APP_URL: "http://localhost:3000", DATABASE_URL: process.env.DATABASE_URL } }));
vi.mock("@/lib/agentClient", () => ({
  clearVendorVerificationSuspension: vi.fn(async () => ({})),
  setVendorVerificationSuspension: vi.fn(async () => ({})),
}));
import { clearVendorVerificationSuspension, setVendorVerificationSuspension } from "@/lib/agentClient";
import { prisma } from "@/lib/db/prisma";
import {
  assertVendorVerificationAllowed,
  reinstateVerificationIfSettled,
  runVerificationSuspensionMonitor,
} from "@/lib/billing/verificationSuspension";
import { ensurePaymentTestUniversity } from "./paymentTestUniversity";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date();

beforeAll(async () => { await ensurePaymentTestUniversity(); });
afterAll(async () => { await prisma.$disconnect(); });
beforeEach(() => { vi.clearAllMocks(); });

async function vendorWithInvoice(invoice: { dueAt: Date | null; hasUnresolvedException?: boolean; paymentStatus?: "UNPAID" | "PAID" }) {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { id: suffix, email: `${suffix}@example.invalid`, name: "Billing owner", userType: "VENDOR" } });
  const vendor = await prisma.vendorProfile.create({
    data: { userId: user.id, companyName: "Suspension test vendor", serviceCategory: "TEST", contactEmail: user.email, applications: { create: { status: "APPROVED" } } },
  });
  const created = await prisma.vendorInvoice.create({
    data: {
      invoiceNumber: `TEST-${suffix}`,
      vendorProfileId: vendor.id,
      periodKey: "2026-08",
      issuerSnapshot: {},
      customerSnapshot: {},
      totalMinor: BigInt(1000),
      platformShareMinor: BigInt(100),
      universityShareMinor: BigInt(900),
      documentStatus: "ISSUED",
      paymentStatus: invoice.paymentStatus ?? "UNPAID",
      hasUnresolvedException: invoice.hasUnresolvedException ?? false,
      issuedAt: new Date(NOW.getTime() - 20 * DAY_MS),
      dueAt: invoice.dueAt,
    },
  });
  return { vendor, invoice: created };
}

const vendorState = (id: string) => prisma.vendorProfile.findUniqueOrThrow({
  where: { id },
  select: { verificationSuspensionCode: true, verificationSuspendedAt: true, verificationSuspensionReason: true, verificationAgentSyncPending: true },
});

describe("Overdue invoice verification suspension in PostgreSQL", () => {
  it("suspends an overdue vendor, syncs the agent, and reinstates it once the invoice is paid", async () => {
    const { vendor, invoice } = await vendorWithInvoice({ dueAt: new Date(NOW.getTime() - DAY_MS) });

    const run = await runVerificationSuspensionMonitor(NOW);

    expect(run.suspended).toContain(vendor.id);
    expect(await vendorState(vendor.id)).toMatchObject({
      verificationSuspensionCode: "UNPAID_INVOICE",
      verificationAgentSyncPending: false,
      verificationSuspensionReason: expect.stringContaining(invoice.invoiceNumber),
    });
    expect(setVendorVerificationSuspension).toHaveBeenCalledWith(vendor.id, expect.objectContaining({ code: "UNPAID_INVOICE" }));
    await expect(assertVendorVerificationAllowed(vendor.id)).rejects.toMatchObject({ code: "VENDOR_VERIFICATION_SUSPENDED" });
    expect(await prisma.auditLog.count({ where: { action: "VENDOR_VERIFICATION_SUSPENDED", targetId: vendor.id } })).toBe(1);

    // A second run must not suspend again or write a duplicate audit row.
    await runVerificationSuspensionMonitor(NOW);
    expect(await prisma.auditLog.count({ where: { action: "VENDOR_VERIFICATION_SUSPENDED", targetId: vendor.id } })).toBe(1);

    await prisma.vendorInvoice.update({ where: { id: invoice.id }, data: { paymentStatus: "PAID" } });
    await expect(reinstateVerificationIfSettled(vendor.id, NOW)).resolves.toBe(true);

    expect(await vendorState(vendor.id)).toEqual({
      verificationSuspensionCode: null,
      verificationSuspendedAt: null,
      verificationSuspensionReason: null,
      verificationAgentSyncPending: false,
    });
    expect(clearVendorVerificationSuspension).toHaveBeenCalledWith(vendor.id);
    expect(await prisma.auditLog.count({ where: { action: "VENDOR_VERIFICATION_REINSTATED", targetId: vendor.id } })).toBe(1);
  });

  it("never suspends for grandfathered, not-yet-due, paid, or exception-held invoices", async () => {
    const fixtures = await Promise.all([
      vendorWithInvoice({ dueAt: null }),
      vendorWithInvoice({ dueAt: new Date(NOW.getTime() + DAY_MS) }),
      vendorWithInvoice({ dueAt: new Date(NOW.getTime() - DAY_MS), paymentStatus: "PAID" }),
      vendorWithInvoice({ dueAt: new Date(NOW.getTime() - DAY_MS), hasUnresolvedException: true }),
    ]);

    const run = await runVerificationSuspensionMonitor(NOW);

    for (const { vendor } of fixtures) {
      expect(run.suspended).not.toContain(vendor.id);
      expect((await vendorState(vendor.id)).verificationSuspensionCode).toBeNull();
    }
  });

  it("keeps the agent sync pending while the agent is unreachable", async () => {
    const { vendor } = await vendorWithInvoice({ dueAt: new Date(NOW.getTime() - DAY_MS) });
    vi.mocked(setVendorVerificationSuspension).mockRejectedValue(new Error("agent offline"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const run = await runVerificationSuspensionMonitor(NOW);

    expect(run.agentSync.failed).toContain(vendor.id);
    expect(await vendorState(vendor.id)).toMatchObject({ verificationSuspensionCode: "UNPAID_INVOICE", verificationAgentSyncPending: true });

    vi.mocked(setVendorVerificationSuspension).mockResolvedValue({} as never);
    const retry = await runVerificationSuspensionMonitor(NOW);
    expect(retry.agentSync.synced).toContain(vendor.id);
    expect((await vendorState(vendor.id)).verificationAgentSyncPending).toBe(false);
    consoleError.mockRestore();
  });

  it("rejects a suspension code without a suspension time at the database level", async () => {
    const { vendor } = await vendorWithInvoice({ dueAt: null });

    await expect(
      prisma.vendorProfile.update({ where: { id: vendor.id }, data: { verificationSuspensionCode: "UNPAID_INVOICE" } }),
    ).rejects.toThrow();
  });
});
