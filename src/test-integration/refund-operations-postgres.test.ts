// @vitest-environment node
// Database invariants for refunds without a window, vendor overdraft, vendor
// top-ups and the refund webhook outbox (docs/payments/REFUNDS_OVERDRAFT_PAYOUTS.md §13.2).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/env", () => ({ env: { APP_URL: "http://localhost:3000", DATABASE_URL: process.env.DATABASE_URL, VENDOR_API_KEY_PEPPER: "isolated-pos-test-pepper-at-least-32-characters", VENDOR_WEBHOOK_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") } }));
vi.mock("@/lib/vendors/paymentWebhookTransport", async (importOriginal) => ({ ...await importOriginal<object>(), resolvePaymentWebhookDestination: vi.fn(async () => ({})) }));
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createPaymentRequest, payPaymentRequest } from "@/lib/payments/paymentRequests";
import { postPayout, postRefund, postSpend, postTopup } from "@/lib/payments/posting";
import { ensurePaymentTestUniversity } from "./paymentTestUniversity";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
beforeAll(async () => {
  if (!["/pos_test", "/unify_wallet_test"].includes(url.pathname) || process.env.NODE_ENV === "production") throw new Error("Refund/overdraft tests require an isolated payment test database.");
  await ensurePaymentTestUniversity();
  await prisma.walletAccount.upsert({ where: { systemCode: "GATEWAY_CLEARING" }, create: { type: "SYSTEM", currency: "ZAR", systemCode: "GATEWAY_CLEARING" }, update: {} });
  await prisma.walletAccount.upsert({ where: { systemCode: "PAYOUT_CLEARING" }, create: { type: "SYSTEM", currency: "ZAR", systemCode: "PAYOUT_CLEARING" }, update: {} });
});
afterAll(async () => { await prisma.$disconnect(); });

async function fixture(studentFunds = BigInt(10000)) {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { id: suffix, email: `${suffix}@example.invalid`, name: "Test owner", userType: "VENDOR" } });
  const vendor = await prisma.vendorProfile.create({ data: { userId: user.id, companyName: "Refund test vendor", serviceCategory: "TEST", contactEmail: user.email, applications: { create: { status: "APPROVED" } }, paymentProfile: { create: { status: "APPROVED" } }, walletAccount: { create: { type: "VENDOR", currency: "ZAR" } } }, include: { walletAccount: true } });
  await prisma.vendorMembership.create({ data: { vendorProfileId: vendor.id, userId: user.id, role: "OWNER" } });
  const branch = await prisma.vendorBranch.create({ data: { vendorProfileId: vendor.id, name: "Refund counter", normalizedName: "refund counter", status: "ACTIVE", paymentApplications: { create: { status: "APPROVED" } } }, include: { paymentApplications: true } });
  await prisma.vendorBranchPaymentAcceptance.create({ data: { vendorBranchId: branch.id, approvedApplicationId: branch.paymentApplications[0].id, qrIdentifier: suffix, approvedAt: new Date() } });
  const credential = await prisma.vendorApiCredential.create({ data: { vendorProfileId: vendor.id, name: "Refund test", keyHash: suffix, keyPrefix: suffix, scopes: ["payments:create", "payments:read", "refunds:create"], branchIds: [branch.id] } });
  const student = await prisma.student.create({ data: { studentNumber: `refund-${suffix}`, email: `refund-${suffix}@example.invalid`, firstName: "Refund", lastName: "Test", walletAccount: { create: { type: "STUDENT", currency: "ZAR" } } }, include: { walletAccount: true } });
  if (studentFunds) await postTopup({ studentAccountId: student.walletAccount!.id, amountMinor: studentFunds, idempotencyKey: randomUUID(), providerPaymentId: randomUUID() });
  return { user, vendor, vendorAccountId: vendor.walletAccount!.id, branch, credential, student, studentAccountId: student.walletAccount!.id, access: { id: vendor.id, branchIds: [branch.id], credentialId: credential.id } };
}

import { registerRefundOperation, refundOperation, getPendingRefundOperation, legacyRefundOperation } from "@/lib/vendors/refundOperations";
import { postRefundInTransaction } from "@/lib/payments/posting";
import { completePayoutBatchWithTransfer, runVendorWalletPayoutForVendor } from "@/lib/vendors/payouts";
import { refundOperationSchema } from "@/lib/payments/refundOperationContract";
const owner = (f: Awaited<ReturnType<typeof fixture>>) => ({ vendorProfileId: f.vendor.id, actor: { userId: f.user.id } });
const api = (f: Awaited<ReturnType<typeof fixture>>) => ({ vendorProfileId: f.vendor.id, actor: { apiCredentialId: f.credential.id } });
async function paid(f: Awaited<ReturnType<typeof fixture>>, amount = 10000) {
  return postSpend({ studentAccountId: f.studentAccountId, vendorBranchId: f.branch.id, amountMinor: BigInt(amount), idempotencyKey: randomUUID() });
}
async function instruction(f: Awaited<ReturnType<typeof fixture>>, spendId: string, amountMinor = 2000, key = randomUUID()) {
  return registerRefundOperation(owner(f), { target: { transactionId: spendId }, amountMinor, idempotencyKey: key });
}
const balanceOf = async (accountId: string) => (await prisma.walletAccountBalance.findUniqueOrThrow({ where: { accountId } })).postedBalanceMinor;
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function waitForBalanceLock() {
  for (let i = 0; i < 100; i++) {
    const rows = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%wallet_account_balance%'`);
    if (Number(rows[0].n)) return;
    await new Promise(r => setTimeout(r, 5));
  }
  throw new Error("Expected a payout waiting for the ledger balance lock.");
}

describe("Durable refund instructions", () => {
  it("survives a lost response, blocks that operator, and allows another operator", async () => {
    const f = await fixture(); const sale = await paid(f);
    const op = await instruction(f, sale.id);
    expect((await getPendingRefundOperation(owner(f))).operation?.id).toBe(op.id);
    await expect(instruction(f, sale.id, 3000)).rejects.toMatchObject({ code: "REFUND_OPERATION_PENDING" });
    const other = await registerRefundOperation(api(f), { target: { transactionId: sale.id }, amountMinor: 1000, idempotencyKey: randomUUID() });
    expect(other.id).not.toBe(op.id);
    const completed = await refundOperation(owner(f), op.id, "execute");
    expect(refundOperationSchema.parse(completed).status).toBe("COMPLETED");
    const replay = await refundOperation(owner(f), op.id, "execute");
    expect(replay.result?.refundTransactionId).toBe(completed.result?.refundTransactionId);
    expect(await balanceOf(f.studentAccountId)).toBe(BigInt(2000));
    await expect(prisma.refundOperation.update({ where: { id: op.id }, data: { status: "PENDING", resolvedAt: null, refundTransactionId: null } })).rejects.toThrow();
  });
  it("serializes competing registrations and freezes terms", async () => {
    const f = await fixture(); const sale = await paid(f);
    const key = randomUUID();
    const registered = await Promise.all([instruction(f, sale.id, 1000, key), instruction(f, sale.id, 1000, key)]);
    expect(registered[0].id).toBe(registered[1].id);
    await expect(instruction(f, sale.id, 2000, key)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(prisma.refundOperation.update({ where: { id: registered[0].id }, data: { amountMinor: BigInt(2000) } })).rejects.toThrow();
  });
  it("replays a committed API refund during suspension and rejects only new execution", async () => {
    const f = await fixture();
    const request = await createPaymentRequest(f.access, { branchId: f.branch.id, orderReference: randomUUID(), amountMinor: 5000, currency: "ZAR", idempotencyKey: randomUUID() });
    await payPaymentRequest(f.student.id, request.id, { idempotencyKey: randomUUID() });
    const input = { target: { paymentRequestId: request.id }, amountMinor: 1000, idempotencyKey: randomUUID() };
    const first = await legacyRefundOperation(api(f), input);
    await prisma.vendorPaymentProfile.update({ where: { vendorProfileId: f.vendor.id }, data: { status: "SUSPENDED", suspensionCode: "OVERDRAFT", suspendedAt: new Date() } });
    await prisma.vendorBranchPaymentAcceptance.update({ where: { vendorBranchId: f.branch.id }, data: { status: "SUSPENDED", suspendedAt: new Date() } });
    const replay = await legacyRefundOperation(api(f), input);
    expect(replay.result?.refundTransactionId).toBe(first.result?.refundTransactionId);
    const rejected = await legacyRefundOperation(api(f), { ...input, idempotencyKey: randomUUID() });
    expect(rejected).toMatchObject({ status: "REJECTED", rejection: { code: "VENDOR_PAYMENT_SUSPENDED", status: 403 } });
    expect((await refundOperation(api(f), rejected.id, "execute")).status).toBe("REJECTED");
    expect(await prisma.paymentWebhookEvent.count({ where: { requestId: request.id, eventType: "payment_request.refunded" } })).toBe(1);
  });
  it("cancellation and execution produce one stable outcome", async () => {
    const f = await fixture(); const sale = await paid(f); const op = await instruction(f, sale.id);
    const results = await Promise.all([refundOperation(owner(f), op.id, "cancel"), refundOperation(owner(f), op.id, "execute")]);
    expect(results[0].status).toBe(results[1].status);
    expect(["CANCELLED", "COMPLETED"]).toContain(results[0].status);
    const count = await prisma.walletTransaction.count({ where: { type: "REFUND", linkedTransactionId: sale.id } });
    expect(count).toBe(results[0].status === "COMPLETED" ? 1 : 0);
    expect((await refundOperation(owner(f), op.id, "execute")).status).toBe(results[0].status);
  });
  it("imports a historical refund without inventing its financial actor", async () => {
    const f = await fixture(); const sale = await paid(f); const key = randomUUID();
    const legacy = await postRefund({ originalTransactionId: sale.id, amountMinor: BigInt(1000), idempotencyKey: key });
    await prisma.vendorBranch.update({ where: { id: f.branch.id }, data: { active: false } });
    const recovered = await instruction(f, sale.id, 1000, key);
    expect(recovered).toMatchObject({ status: "COMPLETED", result: { refundTransactionId: legacy.id, refund: { source: "API" } } });
    expect((await prisma.walletTransaction.findUniqueOrThrow({ where: { id: legacy.id } })).initiatedByUserId).toBeNull();
  });
  it("keeps recovery authorized by membership, credential and branch", async () => {
    const f = await fixture(); const sale = await paid(f); const op = await instruction(f, sale.id);
    const other = await fixture();
    await expect(refundOperation(owner(other), op.id)).rejects.toMatchObject({ status: 404 });
    await prisma.vendorMembership.updateMany({ where: { userId: f.user.id }, data: { active: false } });
    await expect(refundOperation(owner(f), op.id)).rejects.toMatchObject({ status: 403 });
    const apiOp = await registerRefundOperation(api(f), { target: { transactionId: sale.id }, amountMinor: 1000, idempotencyKey: randomUUID() });
    await prisma.vendorApiCredential.update({ where: { id: f.credential.id }, data: { branchIds: [] } });
    await expect(refundOperation(api(f), apiOp.id)).rejects.toMatchObject({ status: 404 });
    await prisma.vendorApiCredential.update({ where: { id: f.credential.id }, data: { revokedAt: new Date() } });
    await expect(refundOperation(api(f), apiOp.id)).rejects.toMatchObject({ status: 401 });
  });
  it("rolls execution and its outbox back on an unexpected database failure", async () => {
    const f = await fixture(); const sale = await paid(f); const op = await instruction(f, sale.id);
    const originalTransaction = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, "$transaction").mockImplementation((async (callback: unknown, options: unknown) => originalTransaction(async tx => {
      const update = tx.refundOperation.update.bind(tx.refundOperation);
      tx.refundOperation.update = ((...args: Parameters<typeof update>) => { if (args[0].data.status === "COMPLETED") throw new Error("completion write interrupted"); return update(...args); }) as unknown as typeof update;
      return (callback as (tx: Prisma.TransactionClient) => Promise<unknown>)(tx);
    }, options as { isolationLevel?: "Serializable" })) as typeof prisma.$transaction);
    try { await expect(refundOperation(owner(f), op.id, "execute")).rejects.toThrow("completion write interrupted"); } finally { spy.mockRestore(); }
    expect((await refundOperation(owner(f), op.id)).status).toBe("PENDING");
    expect(await prisma.walletTransaction.count({ where: { linkedTransactionId: sale.id, type: "REFUND" } })).toBe(0);
    expect((await refundOperation(owner(f), op.id, "execute")).status).toBe("COMPLETED");
  });
});

describe("Payout balances and reservations", () => {
  async function funded() {
    const f = await fixture(BigInt(100000)); const sale = await paid(f, 60000);
    const profile = await prisma.vendorPaymentProfile.update({ where: { vendorProfileId: f.vendor.id }, data: { payoutProvider: "PAYSTACK", payoutDestinationReference: "RCP_test" } });
    return { ...f, sale, profile };
  }
  const run = (f: Awaited<ReturnType<typeof funded>>) => runVendorWalletPayoutForVendor({ vendorProfileId: f.vendor.id, initiatedByUserId: f.user.id, simulateProviderTransfer: true });
  it("waits for a concurrent refund and rechecks the threshold", async () => {
    const f = await funded(); const ready = deferred(), release = deferred();
    const refunding = prisma.$transaction(async tx => {
      await postRefundInTransaction(tx, { originalTransactionId: f.sale.id, amountMinor: BigInt(20000), idempotencyKey: randomUUID() });
      ready.resolve(); await release.promise;
    });
    await ready.promise;
    const payout = run(f);
    try { await waitForBalanceLock(); } finally { release.resolve(); }
    await refunding;
    expect((await payout).batchesCreated).toBe(0);
    expect(await balanceOf(f.vendorAccountId)).toBe(BigInt(40000));
  });
  it("commits a payout debit and reservation release atomically and deduplicates confirmations", async () => {
    const f = await funded();
    const batch = await prisma.payoutBatch.create({ data: { vendorPaymentProfileId: f.profile.id, amountMinor: BigInt(60000), cutoffAt: new Date(), provider: "PAYSTACK", providerIdempotencyKey: randomUUID(), payoutDestinationReference: "RCP_test" } });
    const transfer = { providerTransferId: randomUUID(), transferCode: randomUUID(), reference: batch.providerIdempotencyKey, status: "success", amountMinor: batch.amountMinor, currency: "ZAR" };
    const results = await Promise.all([completePayoutBatchWithTransfer({ providerReference: batch.providerIdempotencyKey, transfer }), completePayoutBatchWithTransfer({ providerReference: batch.providerIdempotencyKey, transfer })]);
    expect(results[0].payoutTransactionId).toBe(results[1].payoutTransactionId);
    expect(await balanceOf(f.vendorAccountId)).toBe(BigInt(0));
    expect((await run(f)).batchesCreated).toBe(0);
  });
  it("a new reservation waits for an earlier debit and batch completion", async () => {
    const f = await funded();
    const batch = await prisma.payoutBatch.create({ data: { vendorPaymentProfileId: f.profile.id, amountMinor: BigInt(10000), cutoffAt: new Date(), provider: "PAYSTACK", providerIdempotencyKey: randomUUID(), payoutDestinationReference: "RCP_test", status: "PROCESSING" } });
    const ready = deferred(), release = deferred();
    const original = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, "$transaction").mockImplementation((async (callback: unknown, options: unknown) => original(async tx => {
      const update = tx.payoutBatch.update.bind(tx.payoutBatch);
      tx.payoutBatch.update = (async (...args: Parameters<typeof update>) => {
        if (args[0].where.id === batch.id && args[0].data.status === "COMPLETED") { ready.resolve(); await release.promise; }
        return update(...args);
      }) as unknown as typeof update;
      return (callback as (tx: Prisma.TransactionClient) => Promise<unknown>)(tx);
    }, options as { isolationLevel?: "Serializable" })) as typeof prisma.$transaction);
    const providerId = randomUUID();
    const completing = completePayoutBatchWithTransfer({ providerReference: batch.providerIdempotencyKey, transfer: { providerTransferId: providerId, transferCode: providerId, reference: batch.providerIdempotencyKey, status: "success", amountMinor: batch.amountMinor, currency: "ZAR" } });
    try {
      await ready.promise;
      const next = run(f);
      try { await waitForBalanceLock(); } finally { release.resolve(); }
      await completing;
      const result = await next;
      expect(result.batchesCreated).toBe(1);
      expect(result.batches[0].amountMinor).toBe(50000);
      expect(await balanceOf(f.vendorAccountId)).toBe(BigInt(0));
    } finally { release.resolve(); spy.mockRestore(); }
  });
  it("a materialization failure retains the reservation until recovery", async () => {
    const f = await funded(); const original = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, "$transaction").mockImplementation((async (callback: unknown, options: unknown) => original(async tx => {
      const update = tx.payoutBatch.update.bind(tx.payoutBatch);
      tx.payoutBatch.update = ((...args: Parameters<typeof update>) => { if (args[0].data.status === "COMPLETED") throw new Error("batch completion interrupted"); return update(...args); }) as unknown as typeof update;
      return (callback as (tx: Prisma.TransactionClient) => Promise<unknown>)(tx);
    }, options as { isolationLevel?: "Serializable" })) as typeof prisma.$transaction);
    try { expect((await run(f)).requiresReconciliation).toBe(1); } finally { spy.mockRestore(); }
    expect(await balanceOf(f.vendorAccountId)).toBe(BigInt(60000));
    expect((await run(f)).batchesCreated).toBe(0);
    const batch = await prisma.payoutBatch.findFirstOrThrow({ where: { vendorPaymentProfileId: f.profile.id } });
    expect(batch.status).toBe("REQUIRES_RECONCILIATION");
    const providerId = `simulated:${batch.providerIdempotencyKey}`;
    await completePayoutBatchWithTransfer({ providerReference: batch.providerIdempotencyKey, transfer: { providerTransferId: providerId, transferCode: providerId, reference: batch.providerIdempotencyKey, status: "success", amountMinor: batch.amountMinor, currency: "ZAR" } });
    expect(await balanceOf(f.vendorAccountId)).toBe(BigInt(0));
    expect(await prisma.walletTransaction.count({ where: { initiatorAccountId: f.vendorAccountId, type: "PAYOUT" } })).toBe(1);
  });
  it("repairs an old ledger-completed batch without another debit", async () => {
    const f = await funded();
    const batch = await prisma.payoutBatch.create({ data: { vendorPaymentProfileId: f.profile.id, amountMinor: BigInt(60000), cutoffAt: new Date(), provider: "PAYSTACK", providerIdempotencyKey: randomUUID(), payoutDestinationReference: "RCP_test", status: "PROCESSING" } });
    const providerId = randomUUID();
    const posted = await postPayout({ vendorAccountId: f.vendorAccountId, amountMinor: batch.amountMinor, idempotencyKey: `payout:${batch.id}`, reference: batch.providerIdempotencyKey, providerPaymentId: providerId, payoutDestinationReference: "RCP_test" });
    const completed = await completePayoutBatchWithTransfer({ providerReference: batch.providerIdempotencyKey, transfer: { providerTransferId: providerId, transferCode: providerId, reference: batch.providerIdempotencyKey, amountMinor: batch.amountMinor, currency: "ZAR", status: "success" } });
    expect(completed.payoutTransactionId).toBe(posted.id);
    expect(await balanceOf(f.vendorAccountId)).toBe(BigInt(0));
  });
});
