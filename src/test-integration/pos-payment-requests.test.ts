// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/env", () => ({ env: { DATABASE_URL: process.env.DATABASE_URL, VENDOR_API_KEY_PEPPER: "isolated-pos-test-pepper-at-least-32-characters" } }));
import { prisma } from "@/lib/db/prisma";
import { createPaymentRequest, payPaymentRequest, cancelPaymentRequest, getStudentRequestReceipt, getMerchantPaymentRequest, listPaymentRequests } from "@/lib/payments/paymentRequests";
import { postTopup } from "@/lib/payments/posting";
import { createVendorApiCredential, authenticateVendorApiKey, revokeVendorApiCredential } from "@/lib/vendors/integrations";
import { hashVendorApiKey } from "@/lib/vendors/integrationCrypto";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
beforeAll(async () => {
  if (!["/pos_test", "/unify_wallet_test"].includes(url.pathname) || process.env.NODE_ENV === "production") throw new Error("POS service tests require an isolated payment test database.");
  await prisma.universityProfile.upsert({ where: { id: "pos-test-university" }, create: { id: "pos-test-university", name: "Test", abbreviation: "TEST", contactEmail: "test@example.invalid", paymentWalletEnabled: true }, update: { paymentWalletEnabled: true } });
  await prisma.walletAccount.upsert({ where: { systemCode: "GATEWAY_CLEARING" }, create: { type: "SYSTEM", currency: "ZAR", systemCode: "GATEWAY_CLEARING" }, update: {} });
});
afterAll(async () => { await prisma.$disconnect(); });
async function fixture(amount = 10000n) {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { id: suffix, email: `${suffix}@example.invalid`, name: "Test owner", userType: "VENDOR" } });
  const vendor = await prisma.vendorProfile.create({ data: { userId: user.id, companyName: "POS test vendor", serviceCategory: "TEST", contactEmail: user.email, applications: { create: { status: "APPROVED" } }, paymentProfile: { create: { status: "APPROVED" } }, walletAccount: { create: { type: "VENDOR", currency: "ZAR" } } } });
  const branch = await prisma.vendorBranch.create({ data: { vendorProfileId: vendor.id, name: "Test counter", normalizedName: "test counter", status: "ACTIVE", paymentApplications: { create: { status: "APPROVED" } } }, include: { paymentApplications: true } });
  await prisma.vendorBranchPaymentAcceptance.create({ data: { vendorBranchId: branch.id, approvedApplicationId: branch.paymentApplications[0].id, qrIdentifier: suffix, approvedAt: new Date() } });
  const credential = await prisma.vendorApiCredential.create({ data: { vendorProfileId: vendor.id, name: "POS test", keyHash: suffix, keyPrefix: suffix, scopes: ["payments:create", "payments:read", "payments:cancel"], branchIds: [branch.id] } });
  const students = [];
  for (const label of ["one", "two"]) {
    const student = await prisma.student.create({ data: { studentNumber: `${label}-${suffix}`, email: `${label}-${suffix}@example.invalid`, firstName: label, lastName: "Test", walletAccount: { create: { type: "STUDENT", currency: "ZAR" } } }, include: { walletAccount: true } });
    if (amount) await postTopup({ studentAccountId: student.walletAccount!.id, amountMinor: amount, idempotencyKey: randomUUID(), providerPaymentId: randomUUID() });
    students.push(student);
  }
  const access = { id: vendor.id, branchIds: [branch.id], credentialId: credential.id };
  const input = { branchId: branch.id, orderReference: `order-${suffix}`, amountMinor: 3500, currency: "ZAR", idempotencyKey: randomUUID() };
  return { access, input, students, credential, branch };
}
describe("POS requests using the real PostgreSQL services", () => {
  it("creates one request on simultaneous merchant retries and rejects changed terms", async () => {
    const f = await fixture(); const results = await Promise.all([createPaymentRequest(f.access, f.input), createPaymentRequest(f.access, f.input)]);
    expect(results[0].id).toBe(results[1].id);
    await expect(createPaymentRequest(f.access, { ...f.input, amountMinor: 4000 })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(createPaymentRequest(f.access, { ...f.input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "ORDER_REFERENCE_CONFLICT" });
  });
  it("allows only one of two payers, balances entries and hides the other payer's receipt", async () => {
    const f = await fixture(); const sale = await createPaymentRequest(f.access, f.input);
    const outcomes = await Promise.allSettled(f.students.map((student) => payPaymentRequest(student.id, sale.id, { idempotencyKey: randomUUID() })));
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    const record = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: sale.id }, include: { walletTransaction: { include: { entries: true } } } });
    expect(record.status).toBe("PAID"); expect(record.walletTransaction!.entries).toHaveLength(2);
    expect(record.walletTransaction!.entries.reduce((sum, entry) => sum + (entry.direction === "CREDIT" ? entry.amountMinor : -entry.amountMinor), 0n)).toBe(0n);
    const other = f.students.find((student) => student.id !== record.payerStudentId)!;
    await expect(getStudentRequestReceipt(other.id, sale.id)).rejects.toMatchObject({ code: "RECEIPT_NOT_FOUND" });
    const balances = await prisma.walletAccountBalance.findMany({ where: { account: { OR: [{ studentId: { in: f.students.map((s) => s.id) } }, { vendorProfileId: f.access.id }] } } });
    expect(balances.every((balance) => balance.postedBalanceMinor >= 0n)).toBe(true);
  });
  it("recovers concurrent duplicate submissions as the same receipt", async () => {
    const f = await fixture(); const sale = await createPaymentRequest(f.access, f.input); const key = randomUUID();
    const results = await Promise.all([payPaymentRequest(f.students[0].id, sale.id, { idempotencyKey: key }), payPaymentRequest(f.students[0].id, sale.id, { idempotencyKey: key })]);
    expect(results[0].transactionId).toBe(results[1].transactionId);
    await expect(payPaymentRequest(f.students[0].id, sale.id, { idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("serialises cancellation against payment", async () => {
    const f = await fixture(); const sale = await createPaymentRequest(f.access, f.input);
    await Promise.allSettled([cancelPaymentRequest(f.access, sale.id), payPaymentRequest(f.students[0].id, sale.id, { idempotencyKey: randomUUID() })]);
    const record = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: sale.id } });
    expect(["PAID", "CANCELLED"]).toContain(record.status);
    expect(Boolean(record.walletTransactionId)).toBe(record.status === "PAID");
  });
  it("leaves insufficient-fund requests pending without a spend", async () => {
    const f = await fixture(0n); const sale = await createPaymentRequest(f.access, f.input);
    await expect(payPaymentRequest(f.students[0].id, sale.id, { idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    const record = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: sale.id } }); expect(record.status).toBe("PENDING"); expect(record.walletTransactionId).toBeNull();
  });
  it("expires from server time and rejects payment", async () => {
    const f = await fixture(); const now = new Date(); const id = randomUUID();
    await prisma.paymentRequest.create({ data: { id, vendorProfileId: f.access.id, vendorBranchId: f.branch.id, credentialId: f.credential.id, orderReference: f.input.orderReference, idempotencyKey: f.input.idempotencyKey, amountMinor: 3500n, currency: "ZAR", createdAt: new Date(now.getTime()-700000), expiresAt: new Date(now.getTime()-100000) } });
    await Promise.allSettled([cancelPaymentRequest(f.access, id), payPaymentRequest(f.students[0].id, id, { idempotencyKey: randomUUID() })]);
    expect((await prisma.paymentRequest.findUniqueOrThrow({ where: { id } })).status).toBe("EXPIRED");
  });
  it("rolls back ledger posting when the request completion cannot commit", async () => {
    const f = await fixture(); const sale = await createPaymentRequest(f.access, f.input);
    const before = (await prisma.walletAccountBalance.findUniqueOrThrow({ where: { accountId: f.students[0].walletAccount!.id } })).postedBalanceMinor;
    // A separate caller transaction is intentionally aborted after the financial operation.
    const { postSpendInTransaction } = await import("@/lib/payments/posting");
    await expect(prisma.$transaction(async (tx) => { await postSpendInTransaction(tx, { studentAccountId: f.students[0].walletAccount!.id, vendorBranchId: f.branch.id, amountMinor: 3500n, idempotencyKey: randomUUID(), reference: sale.orderReference }); throw new Error("abort completion"); })).rejects.toThrow("abort completion");
    expect((await prisma.walletAccountBalance.findUniqueOrThrow({ where: { accountId: f.students[0].walletAccount!.id } })).postedBalanceMinor).toBe(before);
    expect((await prisma.paymentRequest.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("PENDING");
  });
  it("enforces foreign-vendor and branch access including list and cancellation", async () => {
    const f = await fixture(); const foreign = await fixture(); const sale = await createPaymentRequest(f.access, f.input);
    await expect(getMerchantPaymentRequest(foreign.access, sale.id)).rejects.toMatchObject({ status: 404 });
    await expect(cancelPaymentRequest({ ...f.access, branchIds: [] }, sale.id)).rejects.toMatchObject({ status: 404 });
    expect((await listPaymentRequests({ ...f.access, branchIds: [] }, new URLSearchParams())).items).toEqual([]);
    await expect(createVendorApiCredential(f.access.id, "Foreign branch", ["payments:create"], [foreign.branch.id])).rejects.toThrow("does not belong");
  });
  it("keeps legacy keys verification-only and immediately denies revoked keys", async () => {
    const f = await fixture(); const legacy = await createVendorApiCredential(f.access.id, "Legacy");
    expect(legacy.scopes).toEqual(["verification:create", "verification:read"]);
    await expect(authenticateVendorApiKey(`Bearer ${legacy.token}`, "payments:create")).rejects.toMatchObject({ code: "MISSING_SCOPE" });
    const key = await createVendorApiCredential(f.access.id, "POS", ["payments:create"], [f.branch.id]);
    expect(hashVendorApiKey(key.token)).not.toBe(key.token);
    await expect(authenticateVendorApiKey(`Bearer ${key.token}`, "verification:read")).rejects.toMatchObject({ code: "MISSING_SCOPE" });
    await prisma.vendorPaymentProfile.update({ where: { vendorProfileId: f.access.id }, data: { status: "SUSPENDED" } });
    await expect(authenticateVendorApiKey(`Bearer ${key.token}`, "payments:create")).rejects.toMatchObject({ code: "VENDOR_NOT_PAYMENT_ENABLED" });
    await revokeVendorApiCredential(f.access.id, key.id);
    expect(await authenticateVendorApiKey(`Bearer ${key.token}`, "payments:create")).toBeNull();
  });
  it("rejects changes to request terms and terminal outcomes in PostgreSQL", async () => {
    const f = await fixture(); const sale = await createPaymentRequest(f.access, f.input);
    await expect(prisma.paymentRequest.update({ where: { id: sale.id }, data: { amountMinor: 4000n } })).rejects.toThrow();
    await cancelPaymentRequest(f.access, sale.id);
    await expect(prisma.paymentRequest.update({ where: { id: sale.id }, data: { status: "PENDING" } })).rejects.toThrow();
  });
});
