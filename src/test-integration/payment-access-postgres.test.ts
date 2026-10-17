// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/env", () => ({ env: { APP_URL: "https://portal.example.invalid", DATABASE_URL: process.env.DATABASE_URL, VENDOR_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") } }));
vi.mock("@/lib/paymentProviders/paystack/config", () => ({ resolvePaystackWalletTopupConfig: () => ({ secretKey: "synthetic-key", baseUrl: "https://provider.example.invalid" }) }));
vi.mock("@/lib/email/payment-access", () => ({ sendPaymentAccessDecisionEmail: vi.fn() }));
vi.mock("@/lib/paymentProviders/paystack/client", () => ({ createTransferRecipient: vi.fn(async (_secret, _url, input) => ({ recipientCode: `recipient-${randomUUID()}`, active: true, type: "basa", currency: "ZAR", details: { accountName: input.name, accountNumberLast4: input.accountNumber.slice(-4), bankCode: input.bankCode, bankName: "Synthetic bank" } })) }));
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { encryptVendorSecret } from "@/lib/vendors/integrationCrypto";
import { approveBranchPaymentApplication, rejectBranchPaymentApplication, submitBranchPaymentApplication } from "@/lib/payments/branchOnboarding";
import { loadPaymentAccess, paymentAccessAccountHistory } from "@/lib/payments/paymentAccess";
import { paymentAccessSummary } from "@/lib/payments/paymentAccessSummary";
import { saveVendorPayoutDestination } from "@/lib/vendors/payouts";
import { sendPaymentAccessDecisionEmail } from "@/lib/email/payment-access";
import { ensurePaymentTestUniversity } from "./paymentTestUniversity";

beforeAll(async () => { const url = new URL(process.env.DATABASE_URL ?? "http://invalid"); if (!["localhost", "127.0.0.1"].includes(url.hostname) || !["/unify_wallet_test", "/pos_test"].includes(url.pathname) || process.env.NODE_ENV === "production") throw new Error("Requires an isolated synthetic payment test database."); await ensurePaymentTestUniversity(); });
beforeEach(() => { vi.clearAllMocks(); });
afterAll(async () => { await prisma.$disconnect(); });
async function fixture() {
  const id = randomUUID();
  const user = await prisma.user.create({ data: { id, name: "Synthetic owner", email: `${id}@example.invalid`, userType: "VENDOR" } });
  const reviewer = await prisma.user.create({ data: { id: randomUUID(), name: "Synthetic reviewer", email: `${randomUUID()}@example.invalid`, userType: "ADMIN" } });
  const reference = `recipient-${id}`;
  const vendor = await prisma.vendorProfile.create({ data: { userId: user.id, companyName: "Synthetic cafe", serviceCategory: "TEST", contactEmail: user.email,
    applications: { create: { status: "APPROVED" } }, paymentProfile: { create: { payoutProvider: "PAYSTACK", payoutDestinationReference: reference,
      payoutDestinationCiphertext: encryptVendorSecret(JSON.stringify({ provider: "PAYSTACK", recipientCode: reference, accountHolderName: "Synthetic cafe", bankName: "Synthetic bank", bankCode: "001", accountMask: "•••• 1234" })) } } } });
  await prisma.vendorMembership.create({ data: { vendorProfileId: vendor.id, userId: user.id, role: "OWNER" } });
  const branch = await prisma.vendorBranch.create({ data: { vendorProfileId: vendor.id, name: "Synthetic counter", normalizedName: "synthetic counter", active: true, status: "ACTIVE" } });
  return { user, reviewer, vendor, branch, reference };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const submit = (f: Fixture, extra: Partial<Parameters<typeof submitBranchPaymentApplication>[0]> = {}) => submitBranchPaymentApplication({ vendorProfileId: f.vendor.id, actorId: f.user.id, branchId: f.branch.id, acknowledgementAccepted: true, expectedPayoutReference: f.reference, ...extra });
const approve = (f: Fixture, applicationId: string, reference = f.reference) => approveBranchPaymentApplication({ applicationId, reviewerId: f.reviewer.id, expectedPayoutReference: reference });
const snapshot = (reference: string) => ({ payoutDestinationReference: reference, payoutDestinationCiphertext: encryptVendorSecret(JSON.stringify({ provider: "PAYSTACK", recipientCode: reference, bankName: "Updated synthetic bank", accountHolderName: "Synthetic cafe", accountMask: "•••• 5678" })) });
async function changeAccount(f: Fixture, reference = randomUUID()) { await prisma.vendorPaymentProfile.update({ where: { vendorProfileId: f.vendor.id }, data: snapshot(reference) }); return reference; }

describe("branch payment-access transactions", () => {
  it("serializes duplicate requests into one application and audit", async () => {
    const f = await fixture(); const results = await Promise.all([submit(f), submit(f)]);
    expect(results[0].id).toBe(results[1].id);
    expect(await prisma.vendorBranchPaymentApplication.count({ where: { vendorBranchId: f.branch.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { targetId: results[0].id } })).toBe(1);
  });
  it("requires confirmation of changed accounts and keeps the first submission in audit history", async () => {
    const f = await fixture(); const application = await submit(f); const next = await changeAccount(f);
    await expect(approve(f, application.id)).rejects.toThrow("reconfirm");
    await expect(submit(f)).rejects.toThrow("payout account changed");
    await submit(f, { expectedPayoutReference: next, reconfirmApplicationId: application.id });
    const current = await prisma.vendorBranchPaymentApplication.findUniqueOrThrow({ where: { id: application.id } });
    expect(current.submittedAt).toEqual(application.submittedAt); expect(current.payoutDestinationReferenceSnapshot).toBe(next);
    const history = await paymentAccessAccountHistory([application.id]); expect(history).toHaveLength(1); expect(history[0].previous?.accountMask).toBe("•••• 1234"); expect(history[0].next?.accountMask).toBe("•••• 5678");
    await expect(approve(f, application.id)).rejects.toThrow("reconfirm");
    await approve(f, application.id, next);
  });
  it("keeps suspended vendor profiles suspended when another branch is approved", async () => {
    const f = await fixture(); const application = await submit(f);
    const suspendedAt = new Date();
    await prisma.vendorPaymentProfile.update({ where: { vendorProfileId: f.vendor.id }, data: { status: "SUSPENDED", suspensionCode: "OVERDRAFT", suspensionReason: "Synthetic overdraft", suspendedAt } });
    await approve(f, application.id);
    expect(await prisma.vendorPaymentProfile.findUnique({ where: { vendorProfileId: f.vendor.id } })).toMatchObject({ status: "SUSPENDED", suspensionCode: "OVERDRAFT", suspensionReason: "Synthetic overdraft", suspendedAt });
    const data = await loadPaymentAccess(f.vendor.id); expect(paymentAccessSummary(data.branches[0], data.context)).toMatchObject({ approved: true, paymentReady: false });
  });
  it("retains rejection history, reuses bank details and sends one notification per committed decision", async () => {
    const f = await fixture(); const first = await submit(f);
    await rejectBranchPaymentApplication({ applicationId: first.id, reviewerId: f.reviewer.id, notes: "Confirm the branch location." });
    await rejectBranchPaymentApplication({ applicationId: first.id, reviewerId: f.reviewer.id, notes: "Duplicate click" });
    expect(sendPaymentAccessDecisionEmail).toHaveBeenCalledTimes(1);
    const next = await submit(f); expect(next.id).not.toBe(first.id); expect(next.payoutDestinationReferenceSnapshot).toBe(f.reference);
    await approve(f, next.id); await approve(f, next.id);
    expect(sendPaymentAccessDecisionEmail).toHaveBeenCalledTimes(2);
    const data = await loadPaymentAccess(f.vendor.id); expect(data.branches[0].applications.map(app => app.status)).toEqual(["APPROVED", "REJECTED"]);
  });
  it("commits a decision even if its email cannot be delivered", async () => {
    const f = await fixture(); const app = await submit(f); vi.mocked(sendPaymentAccessDecisionEmail).mockRejectedValueOnce(new Error("synthetic failure"));
    await approve(f, app.id); expect((await prisma.vendorBranchPaymentApplication.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("APPROVED");
    await approve(f, app.id); expect(sendPaymentAccessDecisionEmail).toHaveBeenCalledTimes(1);
  });
  it("allows only one of concurrent approval and rejection to win", async () => {
    const f = await fixture(); const app = await submit(f);
    const outcomes = await Promise.allSettled([approve(f, app.id), rejectBranchPaymentApplication({ applicationId: app.id, reviewerId: f.reviewer.id, notes: "Synthetic decision" })]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const record = await prisma.vendorBranchPaymentApplication.findUniqueOrThrow({ where: { id: app.id } }); expect(["APPROVED", "REJECTED"]).toContain(record.status); expect(sendPaymentAccessDecisionEmail).toHaveBeenCalledTimes(1);
  });
  it("rejects foreign branches, inactive branches and revoked vendor approval", async () => {
    const f = await fixture(); const foreign = await fixture(); await expect(submit(f, { branchId: foreign.branch.id })).rejects.toThrow("not found");
    await prisma.vendorBranch.update({ where: { id: f.branch.id }, data: { active: false } }); await expect(submit(f)).rejects.toThrow("Only active branches");
    await prisma.vendorBranch.update({ where: { id: f.branch.id }, data: { active: true } }); const app = await submit(f);
    await prisma.vendorApplication.updateMany({ where: { vendorProfileId: f.vendor.id }, data: { status: "REVOKED" } });
    await expect(approve(f, app.id)).rejects.toThrow("Vendor approval"); await expect(submit(f)).rejects.toThrow("Vendor approval");
  });
  it("requires the university wallet to be enabled before approval", async () => {
    const f = await fixture(); const app = await submit(f); const university = await ensurePaymentTestUniversity();
    await prisma.universityProfile.update({ where: { id: university.id }, data: { paymentWalletEnabled: false } });
    try { await expect(approve(f, app.id)).rejects.toThrow("must be enabled"); } finally { await ensurePaymentTestUniversity(); }
  });
  it("requires owner confirmation for incomplete historical requests", async () => {
    const f = await fixture(); const app = await prisma.vendorBranchPaymentApplication.create({ data: { vendorBranchId: f.branch.id, status: "PENDING", submittedAt: new Date() } });
    await expect(approve(f, app.id)).rejects.toThrow("missing its payout");
    await submit(f, { reconfirmApplicationId: app.id }); await approve(f, app.id);
  });
  it("saves only safe bank snapshots and does not change payment-profile status", async () => {
    const f = await fixture();
    await saveVendorPayoutDestination({ userId: f.user.id, vendorProfileId: f.vendor.id, companyName: "Synthetic", role: "OWNER", branchIds: [f.branch.id] }, f.user.id, { accountHolderName: "Synthetic cafe", accountNumber: "1234567890", bankCode: "001" });
    const data = await loadPaymentAccess(f.vendor.id); expect(data.context.paymentStatus).toBe("PENDING"); expect(data.context.payoutAccount?.accountMask).toBe("•••• 7890"); expect(JSON.stringify(data)).not.toContain("1234567890");
    await expect(saveVendorPayoutDestination({ userId: f.user.id, vendorProfileId: f.vendor.id, companyName: "Synthetic", role: "STAFF", branchIds: [f.branch.id] }, f.user.id, { accountHolderName: "Synthetic", accountNumber: "1234567890", bankCode: "001" })).rejects.toThrow("Only the vendor owner");
  });
  it("rechecks a bank change committed while approval waits for the shared profile", async () => {
    const f = await fixture(); const app = await submit(f);
    await prisma.vendorPaymentProfile.update({ where: { vendorProfileId: f.vendor.id }, data: { status: "SUSPENDED", suspensionCode: "OVERDRAFT", suspensionReason: "Synthetic suspension", suspendedAt: new Date() } });
    let release!: () => void; let acquired!: () => void;
    const ready = new Promise<void>(resolve => { acquired = resolve; }); const gate = new Promise<void>(resolve => { release = resolve; });
    const replacing = prisma.$transaction(async tx => { await tx.vendorPaymentProfile.update({ where: { vendorProfileId: f.vendor.id }, data: snapshot(randomUUID()) }); acquired(); await gate; }, { timeout: 15000 });
    await ready; const approving = approve(f, app.id).then(() => null, error => error as Error);
    try {
      let waiting = false;
      for (let i = 0; i < 200; i++) { const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%vendor_payment_profile%'`); if (Number(rows[0].count) > 0) { waiting = true; break; } await new Promise(resolve => setTimeout(resolve, 5)); }
      expect(waiting).toBe(true);
    } finally { release(); await replacing; }
    expect(await approving).toBeInstanceOf(Error);
    expect((await prisma.vendorBranchPaymentApplication.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("PENDING");
    expect((await prisma.vendorPaymentProfile.findUniqueOrThrow({ where: { vendorProfileId: f.vendor.id } })).status).toBe("SUSPENDED");
  });
});
