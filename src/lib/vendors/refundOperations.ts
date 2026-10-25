import "server-only";
import { Prisma, type RefundOperation } from "@/generated/prisma/client";
import { WalletDomainError } from "@/lib/payments/errors";
import { PosApiError } from "@/lib/payments/posErrors";
import { runSerializableTransaction } from "@/lib/payments/posting";
import { finishRefund, refundSpendInTransaction, type RefundActor, type RefundTarget, type RefundResult } from "./refunds";

import { refundAttempt, refundStage } from "@/lib/payments/refundTrace";

/**
 * Give refund transactions a 15-second execution budget and five seconds to obtain a connection.
 * Record safe stages/attempts while retaining the shared helper's bounded conflict retries.
 */
function runRefundTransaction<T>(phase: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  refundStage(`${phase}.begin`);
  return runSerializableTransaction(async tx => {
    refundStage(`${phase}.authorization`);
    const result = await operation(tx);
    refundStage(`${phase}.commit`);
    return result;
  }, { timeout: 15_000, maxWait: 5_000, onAttempt: refundAttempt });
}

export type RefundAccess = { vendorProfileId: string; actor: RefundActor };
export const operatorIdFor = (actor: RefundActor) => "userId" in actor ? `user:${actor.userId}` : `api:${actor.apiCredentialId}`;

/**
 * Check current vendor approval, membership or unrevoked refund-scoped API credentials.
 * Recovery deliberately permits suspended payments and inactive assigned branches; it never bypasses identity or branch ownership.
 */
async function authorizedBranches(tx: Prisma.TransactionClient, access: RefundAccess) {
  const vendor = await tx.vendorProfile.findFirst({ where: { id: access.vendorProfileId, applications: { some: { status: "APPROVED" } } }, select: { id: true, branches: { select: { id: true } } } });
  if (!vendor) throw new PosApiError("FORBIDDEN", "Vendor access is unavailable.", 403);
  if ("userId" in access.actor) {
    const membership = await tx.vendorMembership.findFirst({ where: { userId: access.actor.userId, vendorProfileId: vendor.id, active: true }, select: { role: true, branches: { select: { vendorBranchId: true } } } });
    if (!membership) throw new PosApiError("FORBIDDEN", "Vendor membership is unavailable.", 403);
    return membership.role === "OWNER" ? vendor.branches.map(b => b.id) : membership.branches.map(b => b.vendorBranchId);
  }
  const credential = await tx.vendorApiCredential.findFirst({ where: { id: access.actor.apiCredentialId, vendorProfileId: vendor.id, revokedAt: null, scopes: { has: "refunds:create" } }, select: { branchIds: true } });
  if (!credential) throw new PosApiError("INVALID_API_KEY", "Refund credential is unavailable.", 401);
  return credential.branchIds;
}

const rejectionStatuses: Partial<Record<WalletDomainError["code"], number>> = {
  VENDOR_PAYMENT_SUSPENDED: 403, VENDOR_NOT_PAYMENT_ENABLED: 403, BRANCH_NOT_PAYMENT_ENABLED: 403,
  ACCOUNT_CLOSED: 403, ACCOUNT_SUSPENDED: 403, PAYMENT_FULLY_REFUNDED: 409, REFUND_AMOUNT_EXCEEDED: 409,
  PAYMENT_WALLET_DISABLED: 503,
};

/**
 * Hide another vendor's or unauthorized branch's operation, and require the original operator while it is pending.
 * Authorization failures do not resolve or cancel the frozen instruction.
 */
async function assertOperationAccess(tx: Prisma.TransactionClient, access: RefundAccess, op: RefundOperation) {
  const branches = await authorizedBranches(tx, access);
  if (op.vendorProfileId !== access.vendorProfileId || !branches.includes(op.branchId)) throw new PosApiError("REQUEST_NOT_FOUND", "Refund operation was not found.", 404);
  if (op.status === "PENDING" && op.operatorId !== operatorIdFor(access.actor)) throw new PosApiError("FORBIDDEN", "Recover this refund with its original operator.", 403);
  return branches;
}

/**
 * Return the authoritative operation snapshot and its completed refund totals when present.
 * Reuse a result just calculated by execution to avoid repeating expensive ledger queries in the same transaction.
 */
async function serialize(tx: Prisma.TransactionClient, op: RefundOperation, branchIds: string[], postedResult?: RefundResult) {
  const result = postedResult ?? (op.status === "COMPLETED" ? (await refundSpendInTransaction(tx, {
    vendorProfileId: op.vendorProfileId, allowedBranchIds: branchIds, target: { transactionId: op.originalTransactionId },
    amountMinor: Number(op.amountMinor), idempotencyKey: op.idempotencyKey,
    actor: op.userId ? { userId: op.userId } : { apiCredentialId: op.apiCredentialId! },
  }, true)).result : undefined);
  return {
    id: op.id, vendorProfileId: op.vendorProfileId, operatorId: op.operatorId, originalTransactionId: op.originalTransactionId,
    paymentRequestId: op.paymentRequestId, branchId: op.branchId, amountMinor: Number(op.amountMinor), currency: "ZAR" as const,
    idempotencyKey: op.idempotencyKey, status: op.status as "PENDING" | "COMPLETED" | "REJECTED" | "CANCELLED",
    createdAt: op.createdAt.toISOString(), resolvedAt: op.resolvedAt?.toISOString() ?? null,
    ...(result ? { result } : {}),
    ...(op.rejectionCode ? { rejection: { code: op.rejectionCode, message: op.rejectionMessage!, status: op.rejectionStatus! } } : {}),
  };
}
export type RefundOperationSnapshot = Awaited<ReturnType<typeof serialize>>;

/**
 * Commit the original spend, amount, actor and reference before any refund execution.
 * A per-vendor/operator lock serializes registration across browsers; a pending instruction blocks another for that operator.
 * Replay identical terms and reconcile matching older ledger refunds without inventing a new financial actor.
 */
export async function registerRefundOperation(access: RefundAccess, input: { target: RefundTarget; amountMinor: number; idempotencyKey: string }) {
  const key = input.idempotencyKey.trim();
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || !key || key.length > 128) throw new PosApiError("INVALID_REQUEST", "Invalid refund instructions.", 400);
  return runRefundTransaction("register", async tx => {
    const branches = await authorizedBranches(tx, access);
    await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`refund-operator:${access.vendorProfileId}:${operatorIdFor(access.actor)}`}, 0))`);
    const request = "paymentRequestId" in input.target ? await tx.paymentRequest.findFirst({ where: { id: input.target.paymentRequestId, vendorProfileId: access.vendorProfileId }, select: { id: true, status: true, walletTransactionId: true, vendorBranchId: true } }) : null;
    if ("paymentRequestId" in input.target && !request) throw new PosApiError("REQUEST_NOT_FOUND", "Payment request was not found.", 404);
    if (request && !branches.includes(request.vendorBranchId)) throw new PosApiError("BRANCH_NOT_ALLOWED", "This key cannot access that branch.", 403);
    if (request && (request.status !== "PAID" || !request.walletTransactionId)) throw new PosApiError("REQUEST_NOT_PAID", "Only paid sales can be refunded.", 409);
    const spendId = "transactionId" in input.target ? input.target.transactionId : request!.walletTransactionId!;
    const spend = await tx.walletTransaction.findFirst({ where: { id: spendId, type: "SPEND", status: "COMPLETED", vendorBranchId: { in: branches } }, include: { entries: { where: { direction: "CREDIT", account: { type: "VENDOR", vendorProfileId: access.vendorProfileId } } }, paymentRequest: { select: { id: true } } } });
    const accountId = spend?.entries[0]?.accountId;
    if (!spend || !accountId) throw new PosApiError("REQUEST_NOT_FOUND", "Payment was not found.", 404);
    const existing = await tx.refundOperation.findUnique({ where: { vendorAccountId_idempotencyKey: { vendorAccountId: accountId, idempotencyKey: key } } });
    if (existing) {
      if (existing.originalTransactionId !== spend.id || existing.amountMinor !== BigInt(input.amountMinor)) throw new WalletDomainError("IDEMPOTENCY_CONFLICT", "Refund reference was used for different terms.");
      await assertOperationAccess(tx, access, existing);
      return serialize(tx, existing, branches);
    }
    const legacy = await tx.walletTransaction.findFirst({ where: { initiatorAccountId: accountId, type: "REFUND", idempotencyKey: key } });
    if (legacy && (legacy.linkedTransactionId !== spend.id || legacy.amountMinor !== BigInt(input.amountMinor) || legacy.status !== "COMPLETED")) throw new WalletDomainError("IDEMPOTENCY_CONFLICT", "Refund reference was used for different terms.");
    const pending = await tx.refundOperation.findFirst({ where: { vendorAccountId: accountId, operatorId: operatorIdFor(access.actor), status: "PENDING" } });
    if (pending && !legacy) throw new PosApiError("REFUND_OPERATION_PENDING", "Recover or cancel your pending refund before starting another.", 409);
    const op = await tx.refundOperation.create({ data: {
      vendorProfileId: access.vendorProfileId, vendorAccountId: accountId, originalTransactionId: spend.id, branchId: spend.vendorBranchId!, paymentRequestId: spend.paymentRequest?.id,
      amountMinor: BigInt(input.amountMinor), currency: "ZAR", idempotencyKey: key, operatorId: operatorIdFor(access.actor),
      ...("userId" in access.actor ? { userId: access.actor.userId } : { apiCredentialId: access.actor.apiCredentialId }),
      ...(legacy ? { status: "COMPLETED", refundTransactionId: legacy.id, resolvedAt: legacy.completedAt! } : {}),
    } });
    return serialize(tx, op, branches);
  });
}

/**
 * Find the current operator's unresolved instruction after checking recovery access.
 * Return no operation only when the authorized lookup succeeds, not when a database or authorization request fails.
 */
export async function getPendingRefundOperation(access: RefundAccess) {
  return runRefundTransaction("pending", async tx => {
    const branches = await authorizedBranches(tx, access);
    const op = await tx.refundOperation.findFirst({ where: { vendorProfileId: access.vendorProfileId, operatorId: operatorIdFor(access.actor), status: "PENDING" } });
    if (op && !branches.includes(op.branchId)) throw new PosApiError("FORBIDDEN", "Your pending refund requires access to its original branch.", 403);
    return { vendorProfileId: access.vendorProfileId, operatorId: operatorIdFor(access.actor), operation: op ? await serialize(tx, op, branches) : null };
  });
}

/**
 * Read, execute or cancel the saved instruction without accepting replacement financial terms.
 * Execution and cancellation lock the same row; completed legacy postings are reconciled before cancellation.
 * Commit expected business rejection as terminal, but let unexpected errors roll back so the pending reference remains recoverable.
 */
export async function refundOperation(access: RefundAccess, id: string, action: "read" | "execute" | "cancel" = "read") {
  const outcome = await runRefundTransaction(action, async tx => {
    refundStage(`${action}.operation_lock`);
    if (action !== "read") await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "refund_operation" WHERE "id" = ${id} FOR UPDATE`);
    let op = await tx.refundOperation.findUnique({ where: { id } });
    if (!op) throw new PosApiError("REQUEST_NOT_FOUND", "Refund operation was not found.", 404);
    const branches = await assertOperationAccess(tx, access, op);
    if (action === "read" || op.status !== "PENDING") return { snapshot: await serialize(tx, op, branches), overdraftStarted: false };
    // A legacy client may have posted the same key after registration. Reconcile before cancelling.
    refundStage(`${action}.reconcile`);
    const existing = await tx.walletTransaction.findFirst({ where: { initiatorAccountId: op.vendorAccountId, type: "REFUND", idempotencyKey: op.idempotencyKey } });
    if (existing && (existing.linkedTransactionId !== op.originalTransactionId || existing.amountMinor !== op.amountMinor || existing.status !== "COMPLETED")) throw new WalletDomainError("IDEMPOTENCY_CONFLICT", "Refund reference was used for different terms.");
    if (action === "cancel" && !existing) {
      refundStage("cancel.resolve");
      op = await tx.refundOperation.update({ where: { id }, data: { status: "CANCELLED", resolvedAt: new Date() } });
      return { snapshot: await serialize(tx, op, branches), overdraftStarted: false };
    }
    let posted;
    try {
      refundStage("execute.posting");
      posted = await refundSpendInTransaction(tx, { vendorProfileId: op.vendorProfileId, allowedBranchIds: branches, target: { transactionId: op.originalTransactionId }, amountMinor: Number(op.amountMinor), idempotencyKey: op.idempotencyKey, actor: access.actor });
    } catch (error) {
      // These domain checks precede ledger writes. SQL/unexpected failures roll back the whole execution.
      const status = error instanceof WalletDomainError ? rejectionStatuses[error.code] : undefined;
      if (!status || !(error instanceof WalletDomainError)) throw error;
      op = await tx.refundOperation.update({ where: { id }, data: { status: "REJECTED", rejectionCode: error.code, rejectionMessage: error.message, rejectionStatus: status, resolvedAt: new Date() } });
      return { snapshot: await serialize(tx, op, branches), overdraftStarted: false };
    }
    refundStage("execute.resolve");
    op = await tx.refundOperation.update({ where: { id }, data: { status: "COMPLETED", refundTransactionId: posted.result.refundTransactionId, resolvedAt: new Date() } });
    refundStage("execute.response");
    const snapshot = await serialize(tx, op, branches, posted.result);
    return { snapshot, overdraftStarted: posted.overdraftStarted };
  });
  if (action !== "read" && outcome.snapshot.status === "COMPLETED") finishRefund(access.vendorProfileId, outcome.overdraftStarted);
  return outcome.snapshot;
}

/**
 * Preserve the older one-request contract by registering frozen terms and then executing the acknowledged operation.
 * Registration and execution commit separately, so a lost response still has a durable operation to recover.
 */
export async function legacyRefundOperation(access: RefundAccess, input: Parameters<typeof registerRefundOperation>[1]) {
  const registered = await registerRefundOperation(access, input);
  return registered.status === "PENDING" ? refundOperation(access, registered.id, "execute") : registered;
}
