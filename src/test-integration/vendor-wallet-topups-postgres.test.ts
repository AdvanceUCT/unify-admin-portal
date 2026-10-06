// @vitest-environment node
// Vendor wallet top-ups against the migrated database, with Paystack mocked (spec §3.5, §13.1).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/env", () => ({ env: { APP_URL: "http://localhost:3000", DATABASE_URL: process.env.DATABASE_URL, PAYMENT_WALLET_TOPUPS_ENABLED: true, PAYMENT_TOPUP_MIN_MINOR: 1_000 } }));
const paystack = vi.hoisted(() => ({ initializeTopupTransaction: vi.fn(), verifyTransaction: vi.fn() }));
vi.mock("@/lib/paymentProviders/paystack/client", () => paystack);
const CONFIG = { secretKey: "sk_test_fixture", mode: "test", accountRef: "vendor-topup-test", expectedIntegrationId: "1", baseUrl: "https://api.paystack.example" };
vi.mock("@/lib/paymentProviders/paystack/config", () => ({ resolvePaystackWalletTopupConfig: () => CONFIG }));
import { prisma } from "@/lib/db/prisma";
import { postPayout, postRefund, postSpend, postTopup } from "@/lib/payments/posting";
import { createVendorWalletTopup, reconcileVendorWalletTopup, reconcileVendorWalletTopupByReference } from "@/lib/vendors/walletTopups";
import { ensurePaymentTestUniversity } from "./paymentTestUniversity";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
beforeAll(async () => {
  if (!["/pos_test", "/unify_wallet_test"].includes(url.pathname) || process.env.NODE_ENV === "production") throw new Error("Vendor top-up tests require an isolated payment test database.");
  await ensurePaymentTestUniversity();
  for (const systemCode of ["GATEWAY_CLEARING", "PAYOUT_CLEARING"]) {
    await prisma.walletAccount.upsert({ where: { systemCode }, create: { type: "SYSTEM", currency: "ZAR", systemCode }, update: {} });
  }
});
afterAll(async () => { await prisma.$disconnect(); });
beforeEach(() => {
  vi.clearAllMocks();
  paystack.initializeTopupTransaction.mockImplementation(async (_key, _url, input) => ({ authorizationUrl: `https://checkout.example/${input.reference}`, accessCode: "access", reference: input.reference }));
});

/** A vendor whose wallet is overdrawn by `deficit` (sale → payout → refund). */
async function overdrawnVendor(deficit: number, role: "OWNER" | "STAFF" = "OWNER") {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { id: suffix, email: `${suffix}@example.invalid`, name: "Owner", userType: "VENDOR" } });
  const vendor = await prisma.vendorProfile.create({ data: { userId: user.id, companyName: "Top-up vendor", serviceCategory: "TEST", contactEmail: user.email, applications: { create: { status: "APPROVED" } }, paymentProfile: { create: { status: "APPROVED" } }, walletAccount: { create: { type: "VENDOR", currency: "ZAR" } } }, include: { walletAccount: true } });
  const branch = await prisma.vendorBranch.create({ data: { vendorProfileId: vendor.id, name: "Counter", normalizedName: "counter", status: "ACTIVE", paymentApplications: { create: { status: "APPROVED" } } }, include: { paymentApplications: true } });
  await prisma.vendorBranchPaymentAcceptance.create({ data: { vendorBranchId: branch.id, approvedApplicationId: branch.paymentApplications[0].id, qrIdentifier: suffix, approvedAt: new Date() } });
  const student = await prisma.student.create({ data: { studentNumber: `vtu-${suffix}`, email: `vtu-${suffix}@example.invalid`, firstName: "T", lastName: "U", walletAccount: { create: { type: "STUDENT", currency: "ZAR" } } }, include: { walletAccount: true } });
  const vendorAccountId = vendor.walletAccount!.id;
  if (deficit > 0) {
    await postTopup({ studentAccountId: student.walletAccount!.id, amountMinor: BigInt(deficit), idempotencyKey: randomUUID(), providerPaymentId: randomUUID() });
    const sale = await postSpend({ studentAccountId: student.walletAccount!.id, vendorBranchId: branch.id, amountMinor: BigInt(deficit), idempotencyKey: randomUUID() });
    await postPayout({ vendorAccountId, amountMinor: BigInt(deficit), idempotencyKey: randomUUID(), providerPaymentId: randomUUID(), payoutDestinationReference: "RCP_test" });
    await postRefund({ originalTransactionId: sale.id, amountMinor: BigInt(deficit), idempotencyKey: randomUUID() });
  }
  const context = { userId: user.id, vendorProfileId: vendor.id, companyName: vendor.companyName, role, branchIds: [branch.id] };
  return { context, vendor, vendorAccountId };
}
const start = (context: Awaited<ReturnType<typeof overdrawnVendor>>["context"], amountMinor: number, idempotencyKey = randomUUID()) =>
  createVendorWalletTopup({ context, amountMinor, idempotencyKey });
const verified = (reference: string, amountMinor: number, status = "success") => ({
  providerTransactionId: randomUUID(), reference, status, amountMinor: BigInt(amountMinor), currency: "ZAR", domain: "test", paidAtIso: null,
});
const balanceOf = async (accountId: string) => (await prisma.walletAccountBalance.findUniqueOrThrow({ where: { accountId } })).postedBalanceMinor;

describe("Vendor wallet top-ups in PostgreSQL", () => {
  it("is owner-only and only available while overdrawn, within min(MIN, deficit)..deficit", async () => {
    const solvent = await overdrawnVendor(0);
    await expect(start(solvent.context, 1_000)).rejects.toMatchObject({ code: "TOPUP_NOT_ALLOWED" });

    const staff = await overdrawnVendor(5_000, "STAFF");
    await expect(start(staff.context, 5_000)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const f = await overdrawnVendor(5_000);
    await expect(start(f.context, 5_001)).rejects.toMatchObject({ code: "TOPUP_AMOUNT_EXCEEDS_DEFICIT" });
    await expect(start(f.context, 999)).rejects.toMatchObject({ code: "TOPUP_AMOUNT_OUT_OF_RANGE" });

    const small = await overdrawnVendor(500);
    await expect(start(small.context, 500)).resolves.toMatchObject({ status: "PENDING", deficitAtStartMinor: 500 });

    const key = randomUUID();
    const first = await start(f.context, 5_000, key);
    expect(first).toMatchObject({ status: "PENDING", amountMinor: 5_000, authorizationUrl: expect.stringContaining(first.reference) });
    expect(first.reference).toMatch(/^unify-vtu-/);
    expect(paystack.initializeTopupTransaction).toHaveBeenLastCalledWith(CONFIG.secretKey, CONFIG.baseUrl, expect.objectContaining({
      metadata: expect.objectContaining({ purpose: "vendor_wallet_topup", vendorProfileId: f.vendor.id }),
      callbackUrl: expect.stringContaining("/vendor/payments/top-up/return?topUpId="),
    }));
    await expect(start(f.context, 5_000, key)).resolves.toMatchObject({ topUpId: first.topUpId });
    await expect(start(f.context, 4_000)).rejects.toMatchObject({ code: "TOPUP_ALREADY_IN_PROGRESS" });
  });

  it("enforces one unresolved attempt in the database (T3)", async () => {
    const f = await overdrawnVendor(5_000);
    const first = await start(f.context, 5_000);
    const attempt = await prisma.vendorWalletTopupAttempt.findUniqueOrThrow({ where: { id: first.topUpId } });
    await expect(prisma.vendorWalletTopupAttempt.create({ data: {
      walletTransactionId: attempt.walletTransactionId, vendorProfileId: f.vendor.id, initiatedByUserId: f.context.userId,
      provider: "PAYSTACK", providerAccountRef: CONFIG.accountRef, reference: `unify-vtu-${randomUUID()}`, amountMinor: BigInt(1), deficitAtStartMinor: BigInt(1),
      idempotencyKey: randomUUID(), initializationFingerprint: "x",
    } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("credits a verified top-up, reinstates an overdraft suspension and is idempotent", async () => {
    const f = await overdrawnVendor(5_000);
    await prisma.vendorPaymentProfile.update({ where: { vendorProfileId: f.vendor.id }, data: { status: "SUSPENDED", suspensionCode: "OVERDRAFT", suspendedAt: new Date(), suspensionReason: "Overdrawn" } });
    const topUp = await start(f.context, 5_000);
    paystack.verifyTransaction.mockResolvedValue(verified(topUp.reference, 5_000));

    const result = await reconcileVendorWalletTopupByReference({ reference: topUp.reference });
    expect(result).toMatchObject({ status: "SUCCEEDED", vendorBalanceMinor: 0, paymentStatus: "APPROVED" });
    expect(await balanceOf(f.vendorAccountId)).toBe(BigInt(0));
    expect(await prisma.auditLog.count({ where: { action: "VENDOR_PAYMENT_REINSTATED", targetType: "VendorPaymentProfile", meta: { path: ["vendorProfileId"], equals: f.vendor.id } } })).toBe(1);

    await expect(reconcileVendorWalletTopup({ vendorProfileId: f.vendor.id, topUpId: topUp.topUpId })).resolves.toMatchObject({ status: "SUCCEEDED" });
    expect(await balanceOf(f.vendorAccountId)).toBe(BigInt(0));
    // A resolved attempt frees the slot, but the wallet is no longer negative.
    await expect(start(f.context, 1_000)).rejects.toMatchObject({ code: "TOPUP_NOT_ALLOWED" });
  });

  it("always credits a confirmed payment even after sales cleared the deficit (T5)", async () => {
    const f = await overdrawnVendor(2_000);
    const topUp = await start(f.context, 2_000);
    // Simulate the deficit being cleared by a vendor top-up posted outside this attempt.
    const clearing = await prisma.walletTransaction.create({ data: { type: "VENDOR_TOPUP", amountMinor: BigInt(2_000), initiatorAccountId: f.vendorAccountId, idempotencyKey: randomUUID(), paymentProvider: "PAYSTACK", providerPaymentId: randomUUID() } });
    const { completePendingVendorTopup } = await import("@/lib/payments/posting");
    await completePendingVendorTopup({ walletTransactionId: clearing.id, vendorAccountId: f.vendorAccountId });

    paystack.verifyTransaction.mockResolvedValue(verified(topUp.reference, 2_000));
    await expect(reconcileVendorWalletTopupByReference({ reference: topUp.reference })).resolves.toMatchObject({ status: "SUCCEEDED", vendorBalanceMinor: 2_000 });
  });

  it("leaves failures and mismatches uncredited", async () => {
    const failed = await overdrawnVendor(3_000);
    const failedTopUp = await start(failed.context, 3_000);
    paystack.verifyTransaction.mockResolvedValueOnce(verified(failedTopUp.reference, 3_000, "failed"));
    await expect(reconcileVendorWalletTopupByReference({ reference: failedTopUp.reference })).resolves.toMatchObject({ status: "FAILED" });
    expect(await balanceOf(failed.vendorAccountId)).toBe(BigInt(-3_000));
    // A failed attempt frees the slot for a new one.
    await expect(start(failed.context, 3_000)).resolves.toMatchObject({ status: "PENDING" });

    const mismatch = await overdrawnVendor(3_000);
    const mismatchTopUp = await start(mismatch.context, 3_000);
    paystack.verifyTransaction.mockResolvedValueOnce(verified(mismatchTopUp.reference, 2_999));
    await expect(reconcileVendorWalletTopupByReference({ reference: mismatchTopUp.reference })).resolves.toMatchObject({ status: "UNKNOWN", failureCode: "PAYSTACK_VERIFICATION_MISMATCH" });
    expect(await balanceOf(mismatch.vendorAccountId)).toBe(BigInt(-3_000));
  });
});
