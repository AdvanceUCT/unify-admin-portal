/**
 * @fileoverview `confirmInvoicePayment()` — the single receipt/allocation boundary.
 *
 * Every caller (webhook, browser reconcile, job reconcile — Phase 5/6) routes
 * through this one function so a webhook race, a browser refresh, and a
 * scheduled reconcile can never each allocate their own payment for the same
 * invoice. It always re-verifies the reference against Paystack itself; it
 * never trusts a caller-supplied amount/status.
 *
 * Deliberately not one big transaction: once Postgres aborts a transaction on
 * a failed statement (a unique-constraint violation, here), every further
 * statement in that same transaction fails too (`25P02`) — confirmed against
 * a real run, not assumed. So each write that can race on a unique
 * constraint (the receipt, then the allocation) is its own atomic statement;
 * a conflict on one is resolved with a fresh, separate read/write rather
 * than by continuing inside the transaction that just aborted. The single
 * unique index behind each `create()` is still the actual concurrency guard.
 *
 * Deliberately not "server-only": CLI/job callers may need this outside the
 * Next.js server bundle, matching `src/lib/payments/foundation.ts`'s precedent.
 * @module lib/billing/paymentConfirmation
 */

import type { Prisma } from "@/generated/prisma/client";
import { VendorInvoicePaymentAttemptStatus, VendorInvoicePaymentStatus } from "@/generated/prisma/enums";
import { recordBillingException } from "@/lib/billing/exceptions";
import { verifyTransaction } from "@/lib/paymentProviders/paystack/client";
import type { PaystackProviderConfig } from "@/lib/paymentProviders/paystack/config";

export type PaymentConfirmationClient = Pick<
  Prisma.TransactionClient,
  "vendorInvoicePaymentAttempt" | "vendorInvoicePayment" | "vendorInvoicePaymentAllocation" | "vendorInvoice" | "billingException"
>;

function hasPrismaErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/**
 * Identifies which unique constraint a P2002 violated. With the pg driver
 * adapter, `error.meta.target` is empty (verified against a real Postgres
 * run) — the only place the violated field is actually named is inside the
 * human-readable `message` ("Unique constraint failed on the fields:
 * (`"attemptId"`)"), so that's parsed as the fallback.
 */
function prismaUniqueTargets(error: unknown): string[] {
  if (!hasPrismaErrorCode(error, "P2002")) return [];

  const meta = (error as { meta?: { target?: unknown } }).meta;
  const target = meta?.target;
  if (Array.isArray(target) && target.length > 0) return target.map(String);
  if (typeof target === "string" && target.length > 0) return [target];

  const message = error instanceof Error ? error.message : "";
  return [...message.matchAll(/`"?([A-Za-z0-9_]+)"?`/g)].map((match) => match[1]);
}

export type ConfirmInvoicePaymentInput = {
  reference: string;
  config: PaystackProviderConfig;
  now?: Date;
};

export type ConfirmInvoicePaymentResult =
  | { outcome: "confirmed"; invoiceId: string; paymentId: string }
  | { outcome: "already_confirmed"; invoiceId: string; paymentId: string }
  | { outcome: "excess"; invoiceId: string; paymentId: string }
  | { outcome: "mismatch"; reason: string }
  | { outcome: "not_successful"; providerStatus: string }
  | { outcome: "attempt_not_found" };

async function recordExcessPayment(
  db: PaymentConfirmationClient,
  input: { invoiceId: string; attemptId: string; paymentId: string; grossAmountMinor: bigint },
) {
  await recordBillingException(db, {
    type: "PAYMENT_EXCESS",
    dedupeKey: `payment-excess:${input.paymentId}`,
    invoiceId: input.invoiceId,
    attemptId: input.attemptId,
    details: { paymentId: input.paymentId, grossAmountMinor: input.grossAmountMinor.toString() },
  });
  await db.vendorInvoice.update({ where: { id: input.invoiceId }, data: { hasUnresolvedException: true } });
}

function allocationUniqueTargetWasHit(error: unknown) {
  const targets = prismaUniqueTargets(error);
  return targets.some((target) => target.includes("invoiceId") || target.includes("paymentId"));
}

/**
 * Authoritative confirmation for one Paystack reference. Re-verifies with
 * Paystack itself, matches the result against the attempt's frozen snapshot
 * (account, exact amount, currency), and — only if everything matches —
 * creates the one immutable receipt and, if the invoice isn't already
 * settled, its one allocation. A second genuinely successful attempt still
 * gets its receipt (never discarded, never double-charged) but is reported
 * `excess` rather than allocated again.
 */
export async function confirmInvoicePayment(
  db: PaymentConfirmationClient,
  input: ConfirmInvoicePaymentInput,
): Promise<ConfirmInvoicePaymentResult> {
  const now = input.now ?? new Date();
  const verified = await verifyTransaction(input.config.secretKey, input.config.baseUrl, input.reference);

  const attempt = await db.vendorInvoicePaymentAttempt.findUnique({ where: { reference: input.reference } });
  if (!attempt) {
    await recordBillingException(db, {
      type: "PAYMENT_UNKNOWN_REFERENCE",
      dedupeKey: `payment-unknown-reference:${input.reference}`,
      details: { reference: input.reference, providerStatus: verified.status },
    });
    return { outcome: "attempt_not_found" };
  }

  if (verified.status !== "success") {
    // A late failed/abandoned observation must never overwrite an already
    // recorded success (e.g. a reconcile job racing a webhook that just landed).
    if (attempt.status !== VendorInvoicePaymentAttemptStatus.SUCCEEDED) {
      await db.vendorInvoicePaymentAttempt.update({
        where: { id: attempt.id },
        data: { status: VendorInvoicePaymentAttemptStatus.FAILED, lastCheckedAt: now, providerTransactionId: verified.providerTransactionId },
      });
    }
    return { outcome: "not_successful", providerStatus: verified.status };
  }

  const accountMatches = attempt.providerAccountRef === input.config.accountRef && attempt.providerMode === input.config.mode;
  const amountMatches = verified.amountMinor === attempt.expectedAmountMinor;
  const currencyMatches = verified.currency === attempt.currency;

  if (!accountMatches || !amountMatches || !currencyMatches) {
    const reason = !amountMatches ? "amount" : !currencyMatches ? "currency" : "account";
    await recordBillingException(db, {
      type: "PAYMENT_MISMATCH",
      dedupeKey: `payment-mismatch:${attempt.id}:${verified.providerTransactionId}`,
      invoiceId: attempt.invoiceId,
      attemptId: attempt.id,
      details: {
        reason,
        expected: { amountMinor: attempt.expectedAmountMinor.toString(), currency: attempt.currency, providerAccountRef: attempt.providerAccountRef, providerMode: attempt.providerMode },
        actual: { amountMinor: verified.amountMinor.toString(), currency: verified.currency, providerTransactionId: verified.providerTransactionId },
      },
    });
    return { outcome: "mismatch", reason };
  }

  // Split evidence is checked but never blocks settlement on its own — a
  // genuine matching collection with a routing anomaly stays recorded as
  // collected, per the handoff, rather than discarded or re-charged.
  const splitMismatch = Boolean(attempt.subaccountCode) && verified.subaccountCode !== attempt.subaccountCode;
  if (splitMismatch) {
    await recordBillingException(db, {
      type: "PAYMENT_SPLIT_MISMATCH",
      dedupeKey: `payment-split-mismatch:${attempt.id}:${verified.providerTransactionId}`,
      invoiceId: attempt.invoiceId,
      attemptId: attempt.id,
      details: { expectedSubaccountCode: attempt.subaccountCode, actualSubaccountCode: verified.subaccountCode, splitEvidence: verified.splitEvidence },
    });
  }

  let payment;
  let paymentIsNew = true;
  try {
    payment = await db.vendorInvoicePayment.create({
      data: {
        attemptId: attempt.id,
        provider: attempt.provider,
        providerAccountRef: attempt.providerAccountRef,
        providerMode: attempt.providerMode,
        providerTransactionId: verified.providerTransactionId,
        grossAmountMinor: verified.amountMinor,
        currency: verified.currency,
        paidAt: verified.paidAtIso ? new Date(verified.paidAtIso) : now,
        feeEvidence: { feesMinor: verified.feesMinor?.toString() ?? null, split: verified.splitEvidence } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (!prismaUniqueTargets(error).some((target) => target.includes("attemptId"))) throw error;
    // Duplicate delivery for the exact same attempt (e.g. a replayed
    // webhook) — the receipt already exists; find it and report accordingly.
    paymentIsNew = false;
    payment = await db.vendorInvoicePayment.findUniqueOrThrow({ where: { attemptId: attempt.id } });
  }

  if (!paymentIsNew) {
    await db.vendorInvoicePaymentAttempt.update({
      where: { id: attempt.id },
      data: { status: VendorInvoicePaymentAttemptStatus.SUCCEEDED, lastCheckedAt: now },
    });

    const allocation = await db.vendorInvoicePaymentAllocation.findUnique({ where: { paymentId: payment.id } });
    if (allocation) return { outcome: "already_confirmed", invoiceId: attempt.invoiceId, paymentId: payment.id };

    const invoiceAllocation = await db.vendorInvoicePaymentAllocation.findUnique({ where: { invoiceId: attempt.invoiceId } });
    if (invoiceAllocation) {
      if (invoiceAllocation.paymentId === payment.id) return { outcome: "already_confirmed", invoiceId: attempt.invoiceId, paymentId: payment.id };
      await recordExcessPayment(db, { invoiceId: attempt.invoiceId, attemptId: attempt.id, paymentId: payment.id, grossAmountMinor: payment.grossAmountMinor });
      return { outcome: "excess", invoiceId: attempt.invoiceId, paymentId: payment.id };
    }

    try {
      await db.vendorInvoicePaymentAllocation.create({
        data: { invoiceId: attempt.invoiceId, paymentId: payment.id, amountAppliedMinor: payment.grossAmountMinor },
      });
    } catch (error) {
      if (!allocationUniqueTargetWasHit(error)) throw error;
      const racedAllocation = await db.vendorInvoicePaymentAllocation.findUnique({ where: { invoiceId: attempt.invoiceId } });
      if (racedAllocation?.paymentId === payment.id) return { outcome: "already_confirmed", invoiceId: attempt.invoiceId, paymentId: payment.id };
      await recordExcessPayment(db, { invoiceId: attempt.invoiceId, attemptId: attempt.id, paymentId: payment.id, grossAmountMinor: payment.grossAmountMinor });
      return { outcome: "excess", invoiceId: attempt.invoiceId, paymentId: payment.id };
    }

    await db.vendorInvoice.update({
      where: { id: attempt.invoiceId },
      data: {
        paymentStatus: VendorInvoicePaymentStatus.PAID,
        ...(splitMismatch ? { hasUnresolvedException: true } : {}),
      },
    });
    return { outcome: "already_confirmed", invoiceId: attempt.invoiceId, paymentId: payment.id };
  }

  // The receipt is now durably committed regardless of what happens next —
  // it is never lost even if the allocation below fails or races.
  await db.vendorInvoicePaymentAttempt.update({
    where: { id: attempt.id },
    data: { status: VendorInvoicePaymentAttemptStatus.SUCCEEDED, lastCheckedAt: now },
  });

  try {
    await db.vendorInvoicePaymentAllocation.create({
      data: { invoiceId: attempt.invoiceId, paymentId: payment.id, amountAppliedMinor: payment.grossAmountMinor },
    });
  } catch (error) {
    if (!allocationUniqueTargetWasHit(error)) throw error;
    const allocation = await db.vendorInvoicePaymentAllocation.findUnique({ where: { invoiceId: attempt.invoiceId } });
    if (allocation?.paymentId === payment.id) {
      await db.vendorInvoice.update({
        where: { id: attempt.invoiceId },
        data: {
          paymentStatus: VendorInvoicePaymentStatus.PAID,
          ...(splitMismatch ? { hasUnresolvedException: true } : {}),
        },
      });
      return { outcome: "confirmed", invoiceId: attempt.invoiceId, paymentId: payment.id };
    }
    // The invoice already has a different, earlier allocation — this is a
    // second genuinely successful attempt. Its receipt is kept; it is
    // reported as excess awaiting resolution, never allocated again.
    await recordExcessPayment(db, { invoiceId: attempt.invoiceId, attemptId: attempt.id, paymentId: payment.id, grossAmountMinor: payment.grossAmountMinor });
    return { outcome: "excess", invoiceId: attempt.invoiceId, paymentId: payment.id };
  }

  await db.vendorInvoice.update({
    where: { id: attempt.invoiceId },
    data: {
      paymentStatus: VendorInvoicePaymentStatus.PAID,
      ...(splitMismatch ? { hasUnresolvedException: true } : {}),
    },
  });

  return { outcome: "confirmed", invoiceId: attempt.invoiceId, paymentId: payment.id };
}
