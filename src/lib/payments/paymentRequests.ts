import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { postSpendInTransaction, runSerializableTransaction } from "./posting";
import { getMobileWalletBalance, resolveWalletPaymentDestination } from "./walletMobile";
import { PosApiError } from "./posErrors";

export type MerchantAccess = { id: string; branchIds: string[]; credentialId: string };
export const createPaymentRequestSchema = z.object({
  branchId: z.string().trim().min(1).max(128),
  orderReference: z.string().trim().min(1).max(128),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.literal("ZAR"),
  idempotencyKey: z.string().trim().min(1).max(128),
}).strict();
export const payRequestSchema = z.object({ idempotencyKey: z.string().trim().min(1).max(128) }).strict();
const requestInclude = { vendorProfile: { select: { companyName: true } }, vendorBranch: { select: { name: true } }, walletTransaction: true } as const;
type RequestRecord = Prisma.PaymentRequestGetPayload<{ include: typeof requestInclude }>;

function effectiveStatus(record: { status: string; expiresAt: Date }) {
  return record.status === "PENDING" && record.expiresAt <= new Date() ? "EXPIRED" : record.status;
}
export function paymentRequestSummary(record: RequestRecord) {
  return {
    id: record.id, orderReference: record.orderReference, branchId: record.vendorBranchId,
    vendorName: record.vendorProfile.companyName, branchName: record.vendorBranch.name,
    amountMinor: Number(record.amountMinor), currency: "ZAR" as const, status: effectiveStatus(record),
    createdAt: record.createdAt.toISOString(), expiresAt: record.expiresAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    transactionId: record.walletTransactionId, qrPayload: `unifywallet://pay-request/${record.id}`,
  };
}
function assertAccess(access: MerchantAccess, record: { vendorProfileId: string; vendorBranchId: string }) {
  if (record.vendorProfileId !== access.id || !access.branchIds.includes(record.vendorBranchId)) {
    throw new PosApiError("REQUEST_NOT_FOUND", "Payment request was not found.", 404);
  }
}
async function expireRequests(where: Prisma.PaymentRequestWhereInput) {
  await prisma.paymentRequest.updateMany({ where: { ...where, status: "PENDING", expiresAt: { lte: new Date() } }, data: { status: "EXPIRED" } });
}
export async function createPaymentRequest(access: MerchantAccess, raw: unknown) {
  const input = createPaymentRequestSchema.parse(raw);
  if (!access.branchIds.includes(input.branchId)) throw new PosApiError("BRANCH_NOT_ALLOWED", "This API key cannot access that branch.", 403);
  const matchExisting = (record: RequestRecord) => {
    assertAccess(access, record);
    if (record.vendorBranchId !== input.branchId || record.orderReference !== input.orderReference || record.amountMinor !== BigInt(input.amountMinor) || record.currency !== input.currency) {
      throw new PosApiError("IDEMPOTENCY_CONFLICT", "This key was used for a different sale.", 409);
    }
    return paymentRequestSummary(record);
  };
  const existing = await prisma.paymentRequest.findUnique({ where: { vendorProfileId_idempotencyKey: { vendorProfileId: access.id, idempotencyKey: input.idempotencyKey } }, include: requestInclude });
  if (existing) return matchExisting(existing);
  const acceptance = await prisma.vendorBranchPaymentAcceptance.findFirst({ where: { vendorBranchId: input.branchId, vendorBranch: { vendorProfileId: access.id } }, select: { qrIdentifier: true } });
  if (!acceptance) throw new PosApiError("BRANCH_NOT_PAYMENT_ENABLED", "Branch cannot accept payments.");
  await resolveWalletPaymentDestination(acceptance.qrIdentifier);
  const now = new Date();
  try {
    return paymentRequestSummary(await prisma.paymentRequest.create({ data: {
      id: randomBytes(24).toString("base64url"), vendorProfileId: access.id, vendorBranchId: input.branchId,
      credentialId: access.credentialId, orderReference: input.orderReference, idempotencyKey: input.idempotencyKey,
      amountMinor: BigInt(input.amountMinor), currency: input.currency, createdAt: now, expiresAt: new Date(now.getTime() + 600_000),
    }, include: requestInclude }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await prisma.paymentRequest.findUnique({ where: { vendorProfileId_idempotencyKey: { vendorProfileId: access.id, idempotencyKey: input.idempotencyKey } }, include: requestInclude });
      if (replay) return matchExisting(replay);
      throw new PosApiError("ORDER_REFERENCE_CONFLICT", "This order reference already exists. Recover its result or use a new reference for a new sale.", 409);
    }
    throw error;
  }
}
export async function listPaymentRequests(access: Pick<MerchantAccess, "id" | "branchIds">, search: URLSearchParams) {
  const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().max(128).optional(), orderReference: z.string().trim().min(1).max(128).optional() }).parse(Object.fromEntries(search));
  const where = { vendorProfileId: access.id, vendorBranchId: { in: access.branchIds }, ...(query.orderReference ? { orderReference: query.orderReference } : {}) };
  await expireRequests(where);
  if (query.cursor && !await prisma.paymentRequest.findFirst({ where: { ...where, id: query.cursor }, select: { id: true } })) throw new PosApiError("INVALID_CURSOR", "Invalid page cursor.");
  const records = await prisma.paymentRequest.findMany({ where, include: requestInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) });
  const hasMore = records.length > query.limit;
  const items = records.slice(0, query.limit).map(paymentRequestSummary);
  return { items, nextCursor: hasMore ? items.at(-1)?.id : null };
}
export async function getMerchantPaymentRequest(access: Pick<MerchantAccess, "id" | "branchIds">, id: string) {
  const where = { id, vendorProfileId: access.id, vendorBranchId: { in: access.branchIds } };
  await expireRequests(where);
  const record = await prisma.paymentRequest.findFirst({ where, include: requestInclude });
  if (!record) throw new PosApiError("REQUEST_NOT_FOUND", "Payment request was not found.", 404);
  return paymentRequestSummary(record);
}
async function lockedRequest(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "payment_request" WHERE "id" = ${id} FOR UPDATE`);
  const record = await tx.paymentRequest.findUnique({ where: { id }, include: requestInclude });
  if (!record) throw new PosApiError("REQUEST_NOT_FOUND", "Payment request was not found.", 404);
  return record;
}
export async function cancelPaymentRequest(access: MerchantAccess, id: string) {
  const result = await runSerializableTransaction(async (tx) => {
    const record = await lockedRequest(tx, id); assertAccess(access, record);
    if (record.status === "PENDING") return paymentRequestSummary(await tx.paymentRequest.update({ where: { id }, data: { status: effectiveStatus(record) === "EXPIRED" ? "EXPIRED" : "CANCELLED" }, include: requestInclude }));
    return paymentRequestSummary(record);
  });
  if (result.status === "PAID") throw new PosApiError("REQUEST_ALREADY_PAID", "A paid sale cannot be cancelled.", 409);
  return result;
}
export async function resolveStudentPaymentRequest(id: string) {
  await expireRequests({ id });
  const record = await prisma.paymentRequest.findUnique({ where: { id }, include: requestInclude });
  if (!record) throw new PosApiError("REQUEST_NOT_FOUND", "Payment request was not found.", 404);
  const summary = paymentRequestSummary(record);
  // No receipt identifiers are disclosed merely by possessing a QR.
  return { ...summary, transactionId: null, completedAt: null };
}
export async function getStudentRequestReceipt(studentId: string, id: string) {
  const record = await prisma.paymentRequest.findFirst({ where: { id, payerStudentId: studentId, status: "PAID" }, include: requestInclude });
  if (!record?.walletTransaction) throw new PosApiError("RECEIPT_NOT_FOUND", "No completed payment receipt for this student.", 404);
  const balance = await getMobileWalletBalance(studentId);
  return { ...paymentRequestSummary(record), resultingBalanceMinor: balance.postedBalanceMinor, status: "COMPLETED" as const };
}
export async function payPaymentRequest(studentId: string, id: string, raw: unknown) {
  const input = payRequestSchema.parse(raw);
  const result = await runSerializableTransaction(async (tx) => {
    const record = await lockedRequest(tx, id);
    if (record.status === "PAID") {
      if (record.payerStudentId !== studentId) throw new PosApiError("REQUEST_ALREADY_PAID", "This sale has already been paid.", 409);
      if (record.walletTransaction?.idempotencyKey !== input.idempotencyKey) throw new PosApiError("IDEMPOTENCY_CONFLICT", "Recover the original receipt rather than starting another payment.", 409);
      return "PAID";
    }
    if (effectiveStatus(record) === "EXPIRED") {
      if (record.status === "PENDING") await tx.paymentRequest.update({ where: { id }, data: { status: "EXPIRED" } });
      return "EXPIRED";
    }
    if (record.status !== "PENDING") return record.status;
    const account = await tx.walletAccount.findUnique({ where: { studentId }, select: { id: true } });
    if (!account) throw new PosApiError("ACCOUNT_NOT_FOUND", "Student payment account was not found.", 404);
    const spend = await postSpendInTransaction(tx, { studentAccountId: account.id, vendorBranchId: record.vendorBranchId, amountMinor: record.amountMinor, reference: record.orderReference, idempotencyKey: input.idempotencyKey });
    if (!spend.completedAt || spend.completedAt >= record.expiresAt) throw new PosApiError("REQUEST_EXPIRED", "This sale has expired.", 409);
    await tx.paymentRequest.update({ where: { id }, data: { status: "PAID", payerStudentId: studentId, walletTransactionId: spend.id, completedAt: spend.completedAt } });
    return "PAID";
  });
  if (result !== "PAID") throw new PosApiError(`REQUEST_${result}`, `This sale is ${result.toLowerCase()}.`, 409);
  return getStudentRequestReceipt(studentId, id);
}
