/**
 * @fileoverview Prepares one Paystack checkout attempt for one invoice.
 *
 * Two-phase by design, per the handoff: phase A runs under a short
 * Serializable transaction that locks in the attempt's snapshot (amount,
 * shares, reference, provider account) and releases immediately; phase B
 * calls Paystack outside any lock, then persists the result. A crash between
 * phases leaves a stale row that the next call recovers from rather than
 * blocking forever.
 *
 * Deliberately not "server-only": `scripts/paystack-check.ts` and future
 * billing CLI scripts may call the shared pieces outside the Next.js server
 * bundle, matching `src/lib/payments/foundation.ts`'s precedent.
 * @module lib/billing/paymentAttempts
 */

import { randomBytes } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { BillingFeeBearer, VendorInvoicePaymentAttemptStatus } from "@/generated/prisma/enums";
import {
  PAYMENT_ATTEMPT_REUSE_WINDOW_SECONDS,
  PAYMENT_ATTEMPT_STALE_PREPARING_SECONDS,
  PAYSTACK_PROVIDER_NAME,
} from "@/lib/billing/constants";
import { BillingDomainError } from "@/lib/billing/errors";
import { recordBillingException } from "@/lib/billing/exceptions";
import { initializeTransaction } from "@/lib/paymentProviders/paystack/client";
import type { PaystackProviderConfig } from "@/lib/paymentProviders/paystack/config";
import { PaystackProviderError } from "@/lib/paymentProviders/paystack/errors";

export type PaymentAttemptClient = Pick<Prisma.TransactionClient, "vendorInvoice" | "vendorInvoicePaymentAttempt" | "billingException">;
type TransactionRunner = Pick<PrismaClient, "$transaction">;

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const MAX_REFERENCE_ATTEMPTS = 3;

function hasPrismaErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function runSerializableTransaction<T>(db: TransactionRunner, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2034") || attempt === MAX_SERIALIZABLE_ATTEMPTS - 1) throw error;
    }
  }
  throw new Error("The payment attempt preparation transaction could not be completed.");
}

function generateReference() {
  // Paystack references accept alphanumerics and a few symbols; hex keeps
  // this unambiguous and URL-safe without needing to consult that allowlist.
  return `unify-inv-${randomBytes(10).toString("hex")}`;
}

function isUnresolvedStatus(status: VendorInvoicePaymentAttemptStatus) {
  return status === "PREPARING" || status === "READY" || status === "PENDING" || status === "UNKNOWN";
}

export type PrepareInvoicePaymentAttemptInput = {
  invoiceId: string;
  ownerUserId: string;
  config: PaystackProviderConfig;
  callbackUrl: string;
  now?: Date;
};

export type PreparedPaymentAttempt = {
  attemptId: string;
  reference: string;
  status: VendorInvoicePaymentAttemptStatus;
  accessCode: string | null;
  authorizationUrl: string | null;
  /** True if an existing usable attempt was returned instead of calling Paystack again. */
  reused: boolean;
};

/**
 * Phase A: validates the invoice is payable, retires any stale/expired prior
 * attempt, and inserts (or reuses) the snapshot row — all under one short
 * Serializable transaction. Returns the row to initialize with Paystack, or
 * null if an already-usable attempt was found (nothing more to do).
 */
async function prepareAttemptSnapshot(db: TransactionRunner, input: PrepareInvoicePaymentAttemptInput) {
  // A reference collision is a genuine unique-constraint violation, which
  // aborts the whole Postgres transaction it happened in — every further
  // statement in that same transaction would then fail too (confirmed
  // against a real run). So each retry after a collision is a brand-new
  // transaction, not another `create()` inside the one that just aborted;
  // the abandon-stale-attempt step above is idempotent and simply no-ops on
  // a retry since the prior attempt is already FAILED by then.
  for (let referenceAttempt = 0; referenceAttempt < MAX_REFERENCE_ATTEMPTS; referenceAttempt += 1) {
    try {
      return await prepareAttemptSnapshotOnce(db, input);
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2002") || referenceAttempt === MAX_REFERENCE_ATTEMPTS - 1) throw error;
    }
  }
  throw new Error("Failed to generate a unique payment attempt reference.");
}

async function prepareAttemptSnapshotOnce(db: TransactionRunner, input: PrepareInvoicePaymentAttemptInput) {
  const now = input.now ?? new Date();

  return runSerializableTransaction(db, async (tx) => {
    const invoice = await tx.vendorInvoice.findUniqueOrThrow({ where: { id: input.invoiceId } });

    if (invoice.documentStatus !== "ISSUED") {
      throw new BillingDomainError("INVOICE_NOT_PAYABLE", "Only an issued invoice can be paid.");
    }
    if (invoice.paymentStatus !== "UNPAID") {
      throw new BillingDomainError("INVOICE_NOT_PAYABLE", `Invoice payment status is ${invoice.paymentStatus}, not UNPAID.`);
    }
    if (invoice.totalMinor <= BigInt(0)) {
      throw new BillingDomainError("INVOICE_NOT_PAYABLE", "A zero-total invoice has no Pay action.");
    }

    const latest = await tx.vendorInvoicePaymentAttempt.findFirst({
      where: { invoiceId: input.invoiceId },
      orderBy: { createdAt: "desc" },
    });

    if (latest && isUnresolvedStatus(latest.status)) {
      const ageSeconds = (now.getTime() - latest.updatedAt.getTime()) / 1000;

      if (latest.status !== "PREPARING" && latest.accessCode && ageSeconds < PAYMENT_ATTEMPT_REUSE_WINDOW_SECONDS) {
        return { reuse: latest, snapshot: null } as const;
      }

      const stale = latest.status === "PREPARING" ? ageSeconds >= PAYMENT_ATTEMPT_STALE_PREPARING_SECONDS : ageSeconds >= PAYMENT_ATTEMPT_REUSE_WINDOW_SECONDS;

      if (!stale) {
        // A genuinely fresh, still-in-progress attempt exists — this is the
        // "confirming" state; the caller should not start another one yet.
        return { reuse: latest, snapshot: null } as const;
      }

      await recordBillingException(tx, {
        type: "PAYMENT_ATTEMPT_ABANDONED",
        dedupeKey: `payment-attempt-abandoned:${latest.id}`,
        invoiceId: invoice.id,
        attemptId: latest.id,
        details: { previousStatus: latest.status, ageSeconds },
      });
      await tx.vendorInvoicePaymentAttempt.update({
        where: { id: latest.id },
        data: { status: VendorInvoicePaymentAttemptStatus.FAILED },
      });
    }

    const priorAttemptCount = await tx.vendorInvoicePaymentAttempt.count({ where: { invoiceId: input.invoiceId } });
    const reference = generateReference();

    const created = await tx.vendorInvoicePaymentAttempt.create({
      data: {
        invoiceId: invoice.id,
        ownerUserId: input.ownerUserId,
        provider: PAYSTACK_PROVIDER_NAME,
        providerAccountRef: input.config.accountRef,
        providerMode: input.config.mode,
        reference,
        expectedAmountMinor: invoice.totalMinor,
        currency: invoice.currency,
        purpose: "vendor_invoice_payment",
        subaccountCode: input.config.subaccountCode,
        transactionChargeMinor: invoice.universityShareMinor,
        feeBearer: BillingFeeBearer.UNIVERSITY,
        initializationFingerprint: `${invoice.id}:${invoice.totalMinor}:${invoice.universityShareMinor}:${invoice.currency}:${input.config.subaccountCode}:${input.config.mode}`,
        status: VendorInvoicePaymentAttemptStatus.PREPARING,
        attemptCount: priorAttemptCount + 1,
      },
    });

    return { reuse: null, snapshot: { id: created.id, reference } } as const;
  });
}

/**
 * The full attempt-preparation service. Phase A (above) is retried on
 * serialization conflicts; phase B (the Paystack call) is not retried
 * automatically here — an ambiguous or failed outcome is a valid *result*
 * (status UNKNOWN or FAILED), not a thrown error, and a repeat Pay click
 * calls this function again to recover or retry.
 */
export async function prepareInvoicePaymentAttempt(
  db: TransactionRunner & PaymentAttemptClient,
  input: PrepareInvoicePaymentAttemptInput,
): Promise<PreparedPaymentAttempt> {
  const prepared = await prepareAttemptSnapshot(db, input);

  if (prepared.reuse) {
    return {
      attemptId: prepared.reuse.id,
      reference: prepared.reuse.reference,
      status: prepared.reuse.status,
      accessCode: prepared.reuse.accessCode,
      authorizationUrl: prepared.reuse.authorizationUrl,
      reused: true,
    };
  }

  const { id: attemptId, reference } = prepared.snapshot;
  const invoice = await db.vendorInvoice.findUniqueOrThrow({ where: { id: input.invoiceId } });
  const customerEmail = (invoice.customerSnapshot as { contactEmail?: string }).contactEmail;
  if (!customerEmail) {
    await recordBillingException(db, {
      type: "PAYMENT_ATTEMPT_MISSING_EMAIL",
      dedupeKey: `payment-attempt-missing-email:${attemptId}`,
      invoiceId: invoice.id,
      attemptId,
      details: {},
    });
    await db.vendorInvoicePaymentAttempt.update({ where: { id: attemptId }, data: { status: VendorInvoicePaymentAttemptStatus.FAILED } });
    throw new BillingDomainError("INVOICE_NOT_PAYABLE", "The invoice's customer snapshot has no contact email to bill.");
  }

  try {
    const result = await initializeTransaction(input.config.secretKey, input.config.baseUrl, {
      email: customerEmail,
      amountMinor: invoice.totalMinor,
      currency: invoice.currency,
      reference,
      subaccountCode: input.config.subaccountCode,
      transactionChargeMinor: invoice.universityShareMinor,
      callbackUrl: input.callbackUrl,
      metadata: { invoiceId: invoice.id, attemptId, purpose: "vendor_invoice_payment" },
    });

    const updated = await db.vendorInvoicePaymentAttempt.update({
      where: { id: attemptId },
      data: {
        status: VendorInvoicePaymentAttemptStatus.READY,
        accessCode: result.accessCode,
        authorizationUrl: result.authorizationUrl,
      },
    });

    return {
      attemptId: updated.id,
      reference: updated.reference,
      status: updated.status,
      accessCode: updated.accessCode,
      authorizationUrl: updated.authorizationUrl,
      reused: false,
    };
  } catch (error) {
    const ambiguous = error instanceof PaystackProviderError && (error.code === "TIMEOUT" || error.code === "UNKNOWN_OUTCOME");
    const nextStatus = ambiguous ? VendorInvoicePaymentAttemptStatus.UNKNOWN : VendorInvoicePaymentAttemptStatus.FAILED;

    await recordBillingException(db, {
      type: ambiguous ? "PAYMENT_ATTEMPT_AMBIGUOUS" : "PAYMENT_ATTEMPT_INIT_FAILED",
      dedupeKey: `payment-attempt-init:${attemptId}:${nextStatus}`,
      invoiceId: invoice.id,
      attemptId,
      details: {
        code: error instanceof PaystackProviderError ? error.code : "UNEXPECTED",
        message: error instanceof Error ? error.message : String(error),
      },
    });

    const updated = await db.vendorInvoicePaymentAttempt.update({
      where: { id: attemptId },
      data: { status: nextStatus },
    });

    if (!ambiguous) throw error;

    // UNKNOWN is a legitimate result, not a thrown error: the caller (and a
    // later reconciliation pass) verifies this same reference before doing
    // anything else with this attempt.
    return {
      attemptId: updated.id,
      reference: updated.reference,
      status: updated.status,
      accessCode: updated.accessCode,
      authorizationUrl: updated.authorizationUrl,
      reused: false,
    };
  }
}
