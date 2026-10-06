// @vitest-environment node
// Database invariants for refunds without a window, vendor overdraft, vendor
// top-ups and the refund webhook outbox (docs/payments/REFUNDS_OVERDRAFT_PAYOUTS.md §13.2).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/env", () => ({ env: { DATABASE_URL: process.env.DATABASE_URL, VENDOR_API_KEY_PEPPER: "isolated-pos-test-pepper-at-least-32-characters", VENDOR_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") } }));
vi.mock("@/lib/vendors/paymentWebhookTransport", async (importOriginal) => ({ ...await importOriginal<object>(), resolvePaymentWebhookDestination: vi.fn(async () => ({})) }));
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createPaymentRequest, payPaymentRequest } from "@/lib/payments/paymentRequests";
import { completePendingVendorTopup, postPayout, postRefund, postSpend, postTopup } from "@/lib/payments/posting";
import { configurePaymentWebhook } from "@/lib/vendors/paymentWebhooks";
import { ensurePaymentTestUniversity } from "./paymentTestUniversity";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
let gatewayId = "";
beforeAll(async () => {
  if (!["/pos_test", "/unify_wallet_test"].includes(url.pathname) || process.env.NODE_ENV === "production") throw new Error("Refund/overdraft tests require an isolated payment test database.");
  await ensurePaymentTestUniversity();
  gatewayId = (await prisma.walletAccount.upsert({ where: { systemCode: "GATEWAY_CLEARING" }, create: { type: "SYSTEM", currency: "ZAR", systemCode: "GATEWAY_CLEARING" }, update: {} })).id;
  await prisma.walletAccount.upsert({ where: { systemCode: "PAYOUT_CLEARING" }, create: { type: "SYSTEM", currency: "ZAR", systemCode: "PAYOUT_CLEARING" }, update: {} });
});
afterAll(async () => { await prisma.$disconnect(); });

async function fixture(studentFunds = BigInt(10000)) {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { id: suffix, email: `${suffix}@example.invalid`, name: "Test owner", userType: "VENDOR" } });
  const vendor = await prisma.vendorProfile.create({ data: { userId: user.id, companyName: "Refund test vendor", serviceCategory: "TEST", contactEmail: user.email, applications: { create: { status: "APPROVED" } }, paymentProfile: { create: { status: "APPROVED" } }, walletAccount: { create: { type: "VENDOR", currency: "ZAR" } } }, include: { walletAccount: true } });
  const branch = await prisma.vendorBranch.create({ data: { vendorProfileId: vendor.id, name: "Refund counter", normalizedName: "refund counter", status: "ACTIVE", paymentApplications: { create: { status: "APPROVED" } } }, include: { paymentApplications: true } });
  await prisma.vendorBranchPaymentAcceptance.create({ data: { vendorBranchId: branch.id, approvedApplicationId: branch.paymentApplications[0].id, qrIdentifier: suffix, approvedAt: new Date() } });
  const credential = await prisma.vendorApiCredential.create({ data: { vendorProfileId: vendor.id, name: "Refund test", keyHash: suffix, keyPrefix: suffix, scopes: ["payments:create", "payments:read", "refunds:create"], branchIds: [branch.id] } });
  const student = await prisma.student.create({ data: { studentNumber: `refund-${suffix}`, email: `refund-${suffix}@example.invalid`, firstName: "Refund", lastName: "Test", walletAccount: { create: { type: "STUDENT", currency: "ZAR" } } }, include: { walletAccount: true } });
  if (studentFunds) await postTopup({ studentAccountId: student.walletAccount!.id, amountMinor: studentFunds, idempotencyKey: randomUUID(), providerPaymentId: randomUUID() });
  return { user, vendor, vendorAccountId: vendor.walletAccount!.id, branch, credential, student, studentAccountId: student.walletAccount!.id, access: { id: vendor.id, branchIds: [branch.id], credentialId: credential.id } };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

const spend = (f: Fixture, amount: number) => postSpend({ studentAccountId: f.studentAccountId, vendorBranchId: f.branch.id, amountMinor: BigInt(amount), idempotencyKey: randomUUID() });
const refund = (originalTransactionId: string, amount: number, initiatedByUserId?: string) => postRefund({ originalTransactionId, amountMinor: BigInt(amount), idempotencyKey: randomUUID(), initiatedByUserId });
const balance = (accountId: string) => prisma.walletAccountBalance.findUniqueOrThrow({ where: { accountId } });

/** Posts a raw two-leg transaction, bypassing the application layer so only database guards apply. */
async function rawPosting(tx: Prisma.TransactionClient, input: { type: "SPEND" | "REFUND" | "VENDOR_TOPUP"; amount: number; initiator: string; debit: string; credit: string; branchId?: string; linkedId?: string; completedAt?: Date; timestamps?: boolean }) {
  const id = randomUUID();
  const now = new Date();
  await tx.walletTransaction.create({ data: {
    id, type: input.type, amountMinor: BigInt(input.amount), initiatorAccountId: input.initiator, vendorBranchId: input.branchId, linkedTransactionId: input.linkedId, idempotencyKey: randomUUID(),
    ...(input.type === "VENDOR_TOPUP" ? { paymentProvider: "PAYSTACK", providerPaymentId: randomUUID() } : {}),
    ...(input.timestamps ? { refundableUntil: now, availableForPayoutAt: now } : {}),
  } });
  await tx.ledgerEntry.createMany({ data: [
    { id: randomUUID(), walletTransactionId: id, accountId: input.debit, sequence: 0, direction: "DEBIT", amountMinor: BigInt(input.amount), currency: "ZAR" },
    { id: randomUUID(), walletTransactionId: id, accountId: input.credit, sequence: 1, direction: "CREDIT", amountMinor: BigInt(input.amount), currency: "ZAR" },
  ] });
  await tx.walletTransaction.update({ where: { id }, data: { status: "COMPLETED", completedAt: input.completedAt ?? new Date() } });
  return id;
}

describe("Refund and overdraft ledger invariants in PostgreSQL", () => {
  it("refunds a spend completed long ago (no refund window)", async () => {
    const f = await fixture();
    const oldSpendId = await prisma.$transaction((tx) => rawPosting(tx, { type: "SPEND", amount: 2000, initiator: f.studentAccountId, debit: f.studentAccountId, credit: f.vendorAccountId, branchId: f.branch.id, completedAt: new Date(Date.now() - 400 * 24 * 3600 * 1000) }));
    await refund(oldSpendId, 2000);
    expect((await balance(f.studentAccountId)).postedBalanceMinor).toBe(BigInt(10000));
  });

  it("rejects newly completed spends that carry refund or settlement timestamps", async () => {
    const f = await fixture();
    await expect(prisma.$transaction((tx) => rawPosting(tx, { type: "SPEND", amount: 100, initiator: f.studentAccountId, debit: f.studentAccountId, credit: f.vendorAccountId, branchId: f.branch.id, timestamps: true }))).rejects.toThrow(/refund or settlement timestamps/i);
  });

  it("lets only vendor REFUND/PAYOUT go negative and tracks negativeSince", async () => {
    const f = await fixture();
    const sale = await spend(f, 3000);
    await postPayout({ vendorAccountId: f.vendorAccountId, amountMinor: BigInt(2000), idempotencyKey: randomUUID(), providerPaymentId: randomUUID(), payoutDestinationReference: "RCP_test" });
    expect((await balance(f.vendorAccountId)).negativeSince).toBeNull();

    await refund(sale.id, 1500);
    const firstNegative = await balance(f.vendorAccountId);
    expect(firstNegative.postedBalanceMinor).toBe(BigInt(-500));
    expect(firstNegative.negativeSince).toBeInstanceOf(Date);

    await refund(sale.id, 500);
    const deeper = await balance(f.vendorAccountId);
    expect(deeper.postedBalanceMinor).toBe(BigInt(-1000));
    expect(deeper.negativeSince).toEqual(firstNegative.negativeSince);

    await postPayout({ vendorAccountId: f.vendorAccountId, amountMinor: BigInt(100), idempotencyKey: randomUUID(), providerPaymentId: randomUUID(), payoutDestinationReference: "RCP_test" });
    expect((await balance(f.vendorAccountId)).postedBalanceMinor).toBe(BigInt(-1100));

    await spend(f, 1100);
    const recovered = await balance(f.vendorAccountId);
    expect(recovered.postedBalanceMinor).toBe(BigInt(0));
    expect(recovered.negativeSince).toBeNull();

    // A vendor debit under any other transaction type, and any student overdraft, is still rejected.
    await expect(prisma.$transaction((tx) => rawPosting(tx, { type: "SPEND", amount: 50, initiator: f.studentAccountId, debit: f.vendorAccountId, credit: f.studentAccountId, branchId: f.branch.id }))).rejects.toThrow(/insufficient wallet balance/i);
    await expect(prisma.$transaction((tx) => rawPosting(tx, { type: "SPEND", amount: 999999, initiator: f.studentAccountId, debit: f.studentAccountId, credit: f.vendorAccountId, branchId: f.branch.id }))).rejects.toThrow(/insufficient wallet balance/i);
  });

  it("rejects refunds at the database level for suspended, unapproved or inactive vendors", async () => {
    for (const block of ["suspended", "application", "acceptance"] as const) {
      const f = await fixture();
      const sale = await spend(f, 1000);
      if (block === "suspended") await prisma.vendorPaymentProfile.update({ where: { vendorProfileId: f.vendor.id }, data: { status: "SUSPENDED", suspensionCode: "OVERDRAFT", suspendedAt: new Date() } });
      if (block === "application") await prisma.vendorApplication.updateMany({ where: { vendorProfileId: f.vendor.id }, data: { status: "REVOKED" } });
      if (block === "acceptance") await prisma.vendorBranchPaymentAcceptance.update({ where: { vendorBranchId: f.branch.id }, data: { status: "SUSPENDED", suspendedAt: new Date() } });
      await expect(prisma.$transaction((tx) => rawPosting(tx, { type: "REFUND", amount: 100, initiator: f.vendorAccountId, debit: f.vendorAccountId, credit: f.studentAccountId, branchId: f.branch.id, linkedId: sale.id }))).rejects.toThrow(/not eligible for refunds/i);
    }
  });

  it("serializes concurrent partial refunds so their total never exceeds the spend", async () => {
    const f = await fixture();
    const sale = await spend(f, 1000);
    const outcomes = await Promise.allSettled([refund(sale.id, 600), refund(sale.id, 600)]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const total = await prisma.walletTransaction.aggregate({ where: { type: "REFUND", status: "COMPLETED", linkedTransactionId: sale.id }, _sum: { amountMinor: true } });
    expect(total._sum.amountMinor).toBe(BigInt(600));
  });

  it("credits vendor top-ups only with provider attribution and the gateway topology", async () => {
    const f = await fixture();
    const sale = await spend(f, 1000);
    await refund(sale.id, 1000);
    await postPayout({ vendorAccountId: f.vendorAccountId, amountMinor: BigInt(1), idempotencyKey: randomUUID(), providerPaymentId: randomUUID(), payoutDestinationReference: "RCP_test" });
    expect((await balance(f.vendorAccountId)).postedBalanceMinor).toBe(BigInt(-1));

    const pending = await prisma.walletTransaction.create({ data: { type: "VENDOR_TOPUP", amountMinor: BigInt(1), initiatorAccountId: f.vendorAccountId, idempotencyKey: randomUUID(), paymentProvider: "PAYSTACK" } });
    await expect(completePendingVendorTopup({ walletTransactionId: pending.id, vendorAccountId: f.vendorAccountId })).rejects.toThrow(/provider attribution/i);
    await prisma.walletTransaction.update({ where: { id: pending.id }, data: { providerPaymentId: randomUUID() } });
    await completePendingVendorTopup({ walletTransactionId: pending.id, vendorAccountId: f.vendorAccountId });
    const restored = await balance(f.vendorAccountId);
    expect(restored.postedBalanceMinor).toBe(BigInt(0));
    expect(restored.negativeSince).toBeNull();

    await expect(prisma.$transaction((tx) => rawPosting(tx, { type: "VENDOR_TOPUP", amount: 10, initiator: f.studentAccountId, debit: gatewayId, credit: f.studentAccountId }))).rejects.toThrow(/vendor top-up ledger topology is invalid/i);
  });
});

describe("Refund webhook outbox in PostgreSQL", () => {
  async function paidSale() {
    const f = await fixture();
    await configurePaymentWebhook(f.access.id, { url: "https://receiver.example/events", branchIds: [f.branch.id] });
    const sale = await createPaymentRequest(f.access, { branchId: f.branch.id, orderReference: `order-${randomUUID()}`, amountMinor: 5000, currency: "ZAR", idempotencyKey: randomUUID() });
    const receipt = await payPaymentRequest(f.student.id, sale.id, { idempotencyKey: randomUUID() });
    return { ...f, sale, spendId: receipt.transactionId! };
  }
  const refundEvents = (requestId: string) => prisma.paymentWebhookEvent.findMany({ where: { requestId, eventType: "payment_request.refunded" }, include: { delivery: true }, orderBy: { createdAt: "asc" } });

  it("emits one refunded event per refund with cumulative totals and a delivery", async () => {
    const f = await paidSale();
    const first = await refund(f.spendId, 3500, f.user.id);
    const second = await refund(f.spendId, 1000);
    const events = await refundEvents(f.sale.id);
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.delivery?.status === "READY")).toBe(true);
    expect(events[0].refundTransactionId).toBe(first.id);
    expect(events[0].payload).toMatchObject({ version: 1, type: "payment_request.refunded", data: { requestId: f.sale.id, amountMinor: 5000, status: "PAID", transactionId: f.spendId, refund: { id: first.id, amountMinor: 3500, source: "PORTAL" }, refundedMinor: 3500, refundableMinor: 1500 } });
    expect(events[1].payload).toMatchObject({ data: { refund: { id: second.id, source: "API" }, refundedMinor: 4500, refundableMinor: 500 } });
    expect(await prisma.paymentWebhookEvent.count({ where: { requestId: f.sale.id, refundTransactionId: null } })).toBe(1);
    await expect(prisma.paymentWebhookEvent.update({ where: { id: events[0].id }, data: { payload: {} } })).rejects.toThrow();
  });

  it("rolls the event back with the refund and emits nothing for legacy spends", async () => {
    const f = await paidSale();
    await expect(prisma.$transaction(async (tx) => {
      await rawPosting(tx, { type: "REFUND", amount: 100, initiator: f.vendorAccountId, debit: f.vendorAccountId, credit: f.studentAccountId, branchId: f.branch.id, linkedId: f.spendId });
      expect(await tx.paymentWebhookEvent.count({ where: { requestId: f.sale.id, eventType: "payment_request.refunded" } })).toBe(1);
      throw new Error("abort refund");
    })).rejects.toThrow("abort refund");
    expect(await refundEvents(f.sale.id)).toHaveLength(0);

    const legacy = await spend(f, 700);
    const legacyRefund = await refund(legacy.id, 700);
    expect(await prisma.paymentWebhookEvent.count({ where: { refundTransactionId: legacyRefund.id } })).toBe(0);
  });
});

describe("POS refund API route in PostgreSQL", () => {
  async function apiFixture(scopes = ["payments:create", "payments:read", "refunds:create"]) {
    const f = await fixture();
    const { createVendorApiCredential } = await import("@/lib/vendors/integrations");
    const key = await createVendorApiCredential(f.vendor.id, "POS refunds", scopes, [f.branch.id]);
    const sale = await createPaymentRequest(f.access, { branchId: f.branch.id, orderReference: `order-${randomUUID()}`, amountMinor: 5000, currency: "ZAR", idempotencyKey: randomUUID() });
    return { ...f, token: key.token, sale };
  }
  async function callRefund(token: string, requestId: string, body: unknown) {
    const { POST } = await import("@/app/api/vendor/v1/payment-requests/[id]/refunds/route");
    const response = await POST(new Request(`http://localhost/api/vendor/v1/payment-requests/${requestId}/refunds`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: requestId }) });
    return { status: response.status, body: await response.json() };
  }

  it("enforces scope, ownership and paid status, then creates and replays a referenced refund", async () => {
    const f = await apiFixture();
    const other = await apiFixture();
    const noScope = await apiFixture(["payments:read"]);
    const body = { amountMinor: 3500, idempotencyKey: randomUUID() };

    expect(await callRefund(noScope.token, noScope.sale.id, body)).toMatchObject({ status: 403, body: { error: { code: "MISSING_SCOPE" } } });
    expect(await callRefund(f.token, other.sale.id, body)).toMatchObject({ status: 404, body: { error: { code: "REQUEST_NOT_FOUND" } } });
    expect(await callRefund(f.token, f.sale.id, body)).toMatchObject({ status: 409, body: { error: { code: "REQUEST_NOT_PAID" } } });
    expect(await callRefund(f.token, f.sale.id, { ...body, extra: true })).toMatchObject({ status: 400 });

    await payPaymentRequest(f.student.id, f.sale.id, { idempotencyKey: randomUUID() });
    const created = await callRefund(f.token, f.sale.id, body);
    expect(created).toMatchObject({ status: 201, body: {
      refund: { paymentRequestId: f.sale.id, amountMinor: 3500, currency: "ZAR", source: "API" },
      paymentRequest: { id: f.sale.id, refundedMinor: 3500, refundableMinor: 1500, refundStatus: "PARTIALLY_REFUNDED", refunds: [{ amountMinor: 3500, source: "API" }] },
    } });
    const replay = await callRefund(f.token, f.sale.id, body);
    expect(replay.status).toBe(200);
    expect(replay.body.refund.id).toBe(created.body.refund.id);
    expect(await callRefund(f.token, f.sale.id, { ...body, amountMinor: 100 })).toMatchObject({ status: 409, body: { error: { code: "IDEMPOTENCY_CONFLICT" } } });
    expect(await callRefund(f.token, f.sale.id, { amountMinor: 2000, idempotencyKey: randomUUID() })).toMatchObject({ status: 409, body: { error: { code: "REFUND_AMOUNT_EXCEEDED" } } });

    // Key scoped to a branch the vendor no longer accepts payments on.
    await prisma.vendorBranchPaymentAcceptance.update({ where: { vendorBranchId: f.branch.id }, data: { status: "SUSPENDED", suspendedAt: new Date() } });
    expect(await callRefund(f.token, f.sale.id, { amountMinor: 100, idempotencyKey: randomUUID() })).toMatchObject({ status: 403, body: { error: { code: "BRANCH_NOT_ALLOWED" } } });
  });

  it("keeps payments:read but blocks refunds:create while suspended", async () => {
    const f = await apiFixture();
    await payPaymentRequest(f.student.id, f.sale.id, { idempotencyKey: randomUUID() });
    await prisma.vendorPaymentProfile.update({ where: { vendorProfileId: f.vendor.id }, data: { status: "SUSPENDED", suspensionCode: "OVERDRAFT", suspendedAt: new Date() } });
    const { authenticateVendorApiKey } = await import("@/lib/vendors/integrations");
    await expect(authenticateVendorApiKey(`Bearer ${f.token}`, "payments:read")).resolves.toMatchObject({ id: f.vendor.id });
    expect(await callRefund(f.token, f.sale.id, { amountMinor: 100, idempotencyKey: randomUUID() })).toMatchObject({ status: 403, body: { error: { code: "VENDOR_PAYMENT_SUSPENDED" } } });
  });
});
