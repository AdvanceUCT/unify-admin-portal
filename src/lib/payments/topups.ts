/**
 * @fileoverview Paystack test-mode student wallet top-ups.
 * @module lib/payments/topups
 */

import "server-only";

import { randomBytes } from "node:crypto";

import { z } from "zod";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { WalletAccountStatus, WalletTransactionStatus, WalletTransactionType, WalletTopupAttemptStatus } from "@/generated/prisma/enums";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { sendFunderTopupReceivedEmail } from "@/lib/email/funder-topup";
import { formatMoneyMinor } from "@/lib/formatters";
import { initializeTopupTransaction, verifyTransaction } from "@/lib/paymentProviders/paystack/client";
import { resolvePaystackWalletTopupConfig, type PaystackWalletTopupConfig } from "@/lib/paymentProviders/paystack/config";
import { PaystackProviderError } from "@/lib/paymentProviders/paystack/errors";
import { WALLET_CURRENCY, PAYSTACK_WALLET_PROVIDER, WALLET_TOPUP_REFERENCE_PREFIX } from "@/lib/payments/constants";
import { ensureStudentWalletAccount } from "@/lib/payments/accounts";
import { WalletDomainError, type WalletErrorCode } from "@/lib/payments/errors";
import { paymentHmac } from "@/lib/payments/hashing";
import { completePendingTopup } from "@/lib/payments/posting";

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const MAX_REFERENCE_ATTEMPTS = 3;
const STALE_TOPUP_MIN_AGE_SECONDS = 120;
const RECONCILE_BATCH_SIZE = 25;
const FUNDER_RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_FUNDER_IP_ATTEMPTS_PER_WINDOW = 10;
const MAX_FUNDER_STUDENT_ATTEMPTS_PER_WINDOW = 5;
const FUNDER_NAME_MIN_LENGTH = 2;
const FUNDER_NAME_MAX_LENGTH = 60;
// C0/C1 controls plus bidi embedding/override/isolate marks, which could
// reorder how the name renders in the student app.
const FUNDER_NAME_CONTROL_CHARACTERS = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu;
const funderEmailSchema = z.string().trim().toLowerCase().email().max(254);

type TransactionRunner = Pick<PrismaClient, "$transaction">;

type TopupOrigin =
  | { kind: "student"; sessionId: string }
  | { kind: "funder"; funderName: string; funderEmail: string; funderIpHash: string | null };

type TopupApiStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";

/** Funder-facing view of a top-up: never carries a balance or any student attribute. */
export type FunderTopupResult = {
  topUpId: string;
  reference: string;
  status: TopupApiStatus;
  authorizationUrl?: string;
  amountMinor: number;
  currency: "ZAR";
  completedAt?: string;
  failureCode?: string;
};

export type WalletTopupApiResult = {
  topUpId: string;
  reference: string;
  status: TopupApiStatus;
  authorizationUrl?: string;
  amountMinor: number;
  currency: "ZAR";
  completedAt?: string;
  transactionId?: string;
  resultingBalanceMinor?: number;
  failureCode?: string;
};

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
  throw new Error("The top-up transaction could not be completed.");
}

function normalizeIdempotencyKey(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new WalletDomainError("INVALID_POSTING", "A valid idempotency key is required.");
  }
  return normalized;
}

function normalizeAmountMinor(value: number) {
  if (!Number.isSafeInteger(value)) {
    throw new WalletDomainError("INVALID_POSTING", "amountMinor must be a safe integer.");
  }
  if (value < env.PAYMENT_TOPUP_MIN_MINOR || value > env.PAYMENT_TOPUP_MAX_MINOR) {
    throw new WalletDomainError("TOPUP_AMOUNT_OUT_OF_RANGE", "Top-up amount is outside the allowed range.");
  }
  return BigInt(value);
}

function assertWalletTopupsEnabled() {
  if (!env.PAYMENT_WALLET_TOPUPS_ENABLED) {
    throw new WalletDomainError("PAYMENT_WALLET_DISABLED", "Wallet top-ups are disabled.");
  }
}

function toSafeNumber(value: bigint) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new WalletDomainError("INVALID_POSTING", "Amount exceeds the safe JSON number range.");
  }
  return Number(value);
}

function generateReference() {
  return `${WALLET_TOPUP_REFERENCE_PREFIX}${randomBytes(10).toString("hex")}`;
}

function callbackUrlFor(origin: TopupOrigin, topUpId: string, reference: string) {
  const url = new URL(origin.kind === "funder" ? "/fund/return" : "/wallet/topups/return", env.APP_URL);
  url.searchParams.set("topUpId", topUpId);
  url.searchParams.set("reference", reference);
  return url.toString();
}

async function serializeTopupAttempt(attempt: {
  id: string;
  reference: string;
  status: WalletTopupAttemptStatus;
  authorizationUrl: string | null;
  amountMinor: bigint;
  currency: string;
  completedAt: Date | null;
  walletTransactionId: string;
  failureCode: string | null;
  walletTransaction?: { status: WalletTransactionStatus; completedAt: Date | null } | null;
  student?: { walletAccount?: { balance?: { postedBalanceMinor: bigint } | null } | null } | null;
}): Promise<WalletTopupApiResult> {
  const walletTransaction = attempt.walletTransaction ?? await prisma.walletTransaction.findUnique({
    where: { id: attempt.walletTransactionId },
    select: { status: true, completedAt: true },
  });
  const balance = attempt.student?.walletAccount?.balance ?? await prisma.walletAccountBalance.findFirst({
    where: { account: { student: { walletTopupAttempts: { some: { id: attempt.id } } } } },
    select: { postedBalanceMinor: true },
  });

  const status = walletTransaction?.status === WalletTransactionStatus.COMPLETED
    ? WalletTopupAttemptStatus.SUCCEEDED
    : attempt.status;

  return {
    topUpId: attempt.id,
    reference: attempt.reference,
    status,
    ...(attempt.authorizationUrl && status === WalletTopupAttemptStatus.PENDING ? { authorizationUrl: attempt.authorizationUrl } : {}),
    amountMinor: toSafeNumber(attempt.amountMinor),
    currency: "ZAR",
    ...(walletTransaction?.completedAt ? { completedAt: walletTransaction.completedAt.toISOString() } : {}),
    ...(status === WalletTopupAttemptStatus.SUCCEEDED ? { transactionId: attempt.walletTransactionId } : {}),
    ...(status === WalletTopupAttemptStatus.SUCCEEDED && balance ? { resultingBalanceMinor: toSafeNumber(balance.postedBalanceMinor) } : {}),
    ...(attempt.failureCode ? { failureCode: attempt.failureCode } : {}),
  };
}

/**
 * Builds the funder-facing result key by key, so nothing the student
 * serializer adds (balance, transaction id) can leak through by spreading.
 */
async function serializeFunderTopupAttempt(attempt: {
  id: string;
  reference: string;
  status: WalletTopupAttemptStatus;
  authorizationUrl: string | null;
  amountMinor: bigint;
  walletTransactionId: string;
  failureCode: string | null;
  walletTransaction?: { status: WalletTransactionStatus; completedAt: Date | null } | null;
}): Promise<FunderTopupResult> {
  const walletTransaction = attempt.walletTransaction ?? await prisma.walletTransaction.findUnique({
    where: { id: attempt.walletTransactionId },
    select: { status: true, completedAt: true },
  });
  const status = walletTransaction?.status === WalletTransactionStatus.COMPLETED
    ? WalletTopupAttemptStatus.SUCCEEDED
    : attempt.status;

  return {
    topUpId: attempt.id,
    reference: attempt.reference,
    status,
    ...(attempt.authorizationUrl && status === WalletTopupAttemptStatus.PENDING ? { authorizationUrl: attempt.authorizationUrl } : {}),
    amountMinor: toSafeNumber(attempt.amountMinor),
    currency: "ZAR",
    ...(walletTransaction?.completedAt ? { completedAt: walletTransaction.completedAt.toISOString() } : {}),
    ...(attempt.failureCode ? { failureCode: attempt.failureCode } : {}),
  };
}

async function assertUniversityWalletEnabled(db: Pick<Prisma.TransactionClient, "universityProfile">) {
  const university = await db.universityProfile.findMany({ take: 2, select: { paymentWalletEnabled: true } });
  if (university.length !== 1 || !university[0].paymentWalletEnabled) {
    throw new WalletDomainError("PAYMENT_WALLET_DISABLED", "Payment wallet functionality is disabled.");
  }
}

function isSameOrigin(existing: { funderName: string | null; funderEmail: string | null }, origin: TopupOrigin) {
  if (origin.kind === "student") return existing.funderEmail === null;
  return existing.funderEmail === origin.funderEmail && existing.funderName === origin.funderName;
}

async function prepareTopupSnapshot(input: {
  studentId: string;
  origin: TopupOrigin;
  amountMinor: bigint;
  idempotencyKey: string;
  config: PaystackWalletTopupConfig;
  now?: Date;
}) {
  // Phase A of top-up creation: reserve the wallet transaction and provider
  // reference in a short serializable transaction, then release all locks
  // before the network call to Paystack.
  const { origin } = input;
  for (let referenceAttempt = 0; referenceAttempt < MAX_REFERENCE_ATTEMPTS; referenceAttempt += 1) {
    try {
      return await runSerializableTransaction(prisma, async (tx) => {
        await assertUniversityWalletEnabled(tx);

        const walletAccount = await tx.walletAccount.findUnique({
          where: { studentId: input.studentId },
          select: { id: true, status: true, currency: true },
        });
        if (!walletAccount) throw new WalletDomainError("ACCOUNT_NOT_FOUND", "Student wallet account was not found.");
        if (walletAccount.status !== WalletAccountStatus.ACTIVE) {
          throw new WalletDomainError(
            walletAccount.status === WalletAccountStatus.CLOSED ? "ACCOUNT_CLOSED" : "ACCOUNT_SUSPENDED",
            "Student wallet account cannot start a top-up.",
          );
        }
        if (walletAccount.currency !== WALLET_CURRENCY) {
          throw new WalletDomainError("UNSUPPORTED_CURRENCY", "Student wallet currency is not supported.");
        }
        const gatewayAccount = await tx.walletAccount.findUnique({
          where: { systemCode: "GATEWAY_CLEARING" },
          select: { id: true },
        });
        if (!gatewayAccount) {
          throw new WalletDomainError("ACCOUNT_NOT_FOUND", "Gateway clearing account was not found.");
        }

        const existing = await tx.walletTopupAttempt.findUnique({
          where: { studentId_idempotencyKey: { studentId: input.studentId, idempotencyKey: input.idempotencyKey } },
          include: { walletTransaction: true },
        });
        if (existing) {
          // Mobile clients may retry after losing the response. Reuse is safe
          // only when the key maps to the same amount/currency snapshot.
          if (existing.amountMinor !== input.amountMinor || existing.currency !== WALLET_CURRENCY || !isSameOrigin(existing, origin)) {
            throw new WalletDomainError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different top-up.");
          }
          return { reuse: existing, snapshot: null } as const;
        }

        if (origin.kind === "funder") {
          // Counted inside the serializable transaction that inserts the
          // attempt, so concurrent funders cannot both slip under the limit.
          const windowStart = new Date((input.now ?? new Date()).getTime() - FUNDER_RATE_WINDOW_MS);
          const openFunderAttempts = await tx.walletTopupAttempt.count({
            where: {
              studentId: input.studentId,
              funderEmail: { not: null },
              status: { in: [WalletTopupAttemptStatus.PENDING, WalletTopupAttemptStatus.UNKNOWN] },
              createdAt: { gte: windowStart },
            },
          });
          if (openFunderAttempts >= MAX_FUNDER_STUDENT_ATTEMPTS_PER_WINDOW) {
            throw new WalletDomainError("RATE_LIMITED", "Too many funding attempts for this recipient.");
          }
        }

        const reference = generateReference();
        const walletTransaction = await tx.walletTransaction.create({
          data: {
            type: WalletTransactionType.TOPUP,
            status: WalletTransactionStatus.PENDING,
            amountMinor: input.amountMinor,
            currency: WALLET_CURRENCY,
            initiatorAccountId: walletAccount.id,
            idempotencyKey: input.idempotencyKey,
            reference,
            paymentProvider: PAYSTACK_WALLET_PROVIDER,
          },
        });

        const created = await tx.walletTopupAttempt.create({
          data: {
            walletTransactionId: walletTransaction.id,
            studentId: input.studentId,
            provider: PAYSTACK_WALLET_PROVIDER,
            providerAccountRef: input.config.accountRef,
            providerMode: input.config.mode,
            reference,
            amountMinor: input.amountMinor,
            currency: WALLET_CURRENCY,
            idempotencyKey: input.idempotencyKey,
            initializationFingerprint: `${input.studentId}:${input.amountMinor}:${WALLET_CURRENCY}:${input.config.accountRef}:${input.config.mode}`
              + (origin.kind === "funder" ? `:${origin.funderEmail}` : ""),
            status: WalletTopupAttemptStatus.PENDING,
            ...(origin.kind === "student"
              ? { sessionId: origin.sessionId }
              : { sessionId: null, funderName: origin.funderName, funderEmail: origin.funderEmail, funderIpHash: origin.funderIpHash }),
          },
          include: { walletTransaction: true },
        });
        return { reuse: null, snapshot: created } as const;
      });
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2002") || referenceAttempt === MAX_REFERENCE_ATTEMPTS - 1) throw error;
    }
  }

  throw new Error("Failed to generate a unique wallet top-up reference.");
}

type TopupSnapshot = NonNullable<Awaited<ReturnType<typeof prepareTopupSnapshot>>["snapshot"]>;

async function initializeProviderCheckout(input: {
  attempt: TopupSnapshot;
  origin: TopupOrigin;
  payerEmail: string;
  config: PaystackWalletTopupConfig;
}) {
  // Phase B calls Paystack after the durable snapshot exists. A crash or
  // timeout here leaves a recoverable attempt that reconciliation verifies by
  // reference instead of creating a second provider transaction.
  const { attempt, config, origin } = input;

  try {
    const initialized = await initializeTopupTransaction(config.secretKey, config.baseUrl, {
      email: input.payerEmail,
      amountMinor: attempt.amountMinor,
      currency: WALLET_CURRENCY,
      reference: attempt.reference,
      callbackUrl: callbackUrlFor(origin, attempt.id, attempt.reference),
      metadata: {
        purpose: origin.kind === "funder" ? "funder_wallet_topup" : "student_wallet_topup",
        topUpId: attempt.id,
        walletTransactionId: attempt.walletTransactionId,
      },
    });

    if (initialized.reference !== attempt.reference) {
      return prisma.walletTopupAttempt.update({
        where: { id: attempt.id },
        data: { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: "PAYSTACK_INITIALIZE_REFERENCE_MISMATCH" },
        include: { walletTransaction: true },
      });
    }

    return prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: {
        accessCode: initialized.accessCode,
        authorizationUrl: initialized.authorizationUrl,
        status: WalletTopupAttemptStatus.PENDING,
      },
      include: { walletTransaction: true },
    });
  } catch (error) {
    const ambiguous = error instanceof PaystackProviderError && (error.code === "TIMEOUT" || error.code === "UNKNOWN_OUTCOME");
    const status = ambiguous ? WalletTopupAttemptStatus.UNKNOWN : WalletTopupAttemptStatus.FAILED;
    const failureCode = error instanceof PaystackProviderError ? error.code : "PROVIDER_INITIALIZE_FAILED";
    await prisma.$transaction([
      prisma.walletTopupAttempt.update({
        where: { id: attempt.id },
        data: { status, failureCode: ambiguous ? null : failureCode },
      }),
      prisma.walletTransaction.update({
        where: { id: attempt.walletTransactionId },
        data: ambiguous
          ? { failureCode: null }
          : { status: WalletTransactionStatus.FAILED, failedAt: new Date(), failureCode },
      }),
    ]);
    if (ambiguous) {
      return { ...attempt, status, failureCode: null };
    }
    throw error;
  }
}

function assertTopupCurrency(currency: string) {
  if (currency !== WALLET_CURRENCY) {
    throw new WalletDomainError("UNSUPPORTED_CURRENCY", "Only ZAR top-ups are supported.");
  }
}

export async function createWalletTopup(input: {
  studentId: string;
  sessionId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
}) {
  assertWalletTopupsEnabled();
  assertTopupCurrency(input.currency);

  const amountMinor = normalizeAmountMinor(input.amountMinor);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const config = resolvePaystackWalletTopupConfig();
  const origin: TopupOrigin = { kind: "student", sessionId: input.sessionId };
  const prepared = await prepareTopupSnapshot({ studentId: input.studentId, origin, amountMinor, idempotencyKey, config });

  if (prepared.reuse) {
    return serializeTopupAttempt(prepared.reuse);
  }

  const student = await prisma.student.findUniqueOrThrow({ where: { id: input.studentId }, select: { email: true } });
  const attempt = await initializeProviderCheckout({ attempt: prepared.snapshot, origin, payerEmail: student.email, config });
  return serializeTopupAttempt(attempt);
}

function normalizeFunderName(value: string) {
  const normalized = value.replace(FUNDER_NAME_CONTROL_CHARACTERS, "").replace(/\s+/g, " ").trim();
  const length = [...normalized].length;
  if (length < FUNDER_NAME_MIN_LENGTH || length > FUNDER_NAME_MAX_LENGTH) {
    throw new WalletDomainError("INVALID_POSTING", `Funder name must be ${FUNDER_NAME_MIN_LENGTH}-${FUNDER_NAME_MAX_LENGTH} characters.`);
  }
  return normalized;
}

function normalizeFunderEmail(value: string) {
  const parsed = funderEmailSchema.safeParse(value);
  if (!parsed.success) throw new WalletDomainError("INVALID_POSTING", "A valid funder email is required.");
  return parsed.data;
}

function normalizeSurname(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-ZA");
}

const RECIPIENT_NOT_ELIGIBLE_MESSAGE = "We couldn't accept funding for that student. Check the student number and surname.";
const INELIGIBLE_RECIPIENT_CODES = new Set<WalletErrorCode>([
  "PAYMENT_WALLET_DISABLED",
  "ACCOUNT_SUSPENDED",
  "ACCOUNT_CLOSED",
  "ACCOUNT_NOT_FOUND",
]);

/**
 * Every ineligible-recipient case looks identical to the funder (no
 * existence oracle); the distinct reason is only logged, with IDs only.
 */
function recipientNotEligible(reason: string, studentId?: string) {
  console.warn(`[funder-topup] recipient not eligible: ${reason}${studentId ? ` (student ${studentId})` : ""}`);
  return new WalletDomainError("FUNDING_RECIPIENT_NOT_ELIGIBLE", RECIPIENT_NOT_ELIGIBLE_MESSAGE);
}

async function resolveFundingRecipient(studentNumber: string, studentSurname: string) {
  const student = await prisma.student.findUnique({
    // Upper-cased like student activation's lookup, since the form shows the field in caps.
    where: { studentNumber: studentNumber.trim().toUpperCase() },
    select: { id: true, lastName: true },
  });
  if (!student) throw recipientNotEligible("unknown student number");
  if (normalizeSurname(student.lastName) !== normalizeSurname(studentSurname)) {
    throw recipientNotEligible("surname mismatch", student.id);
  }
  return student.id;
}

/**
 * Starts a Paystack checkout paid by an external funder (no account) into a
 * student's closed-loop wallet. Crediting still happens only through
 * `reconcileWalletTopup`.
 */
export async function createFunderTopup(input: {
  studentNumber: string;
  studentSurname: string;
  funderName: string;
  funderEmail: string;
  amountMinor: number;
  currency: "ZAR";
  idempotencyKey: string;
  ipAddress: string | null;
  now?: Date;
}): Promise<FunderTopupResult> {
  assertWalletTopupsEnabled();
  assertTopupCurrency(input.currency);
  const amountMinor = normalizeAmountMinor(input.amountMinor);
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  const funderName = normalizeFunderName(input.funderName);
  const funderEmail = normalizeFunderEmail(input.funderEmail);
  const now = input.now ?? new Date();

  // Fails closed without the pepper (dev OTP bypass only), even when no IP is known.
  if (!env.PAYMENT_OTP_PEPPER) {
    throw new WalletDomainError("PAYMENT_WALLET_DISABLED", "Payment OTP configuration is missing.");
  }
  const funderIpHash = input.ipAddress ? paymentHmac(`ip:${input.ipAddress}`) : null;

  // The per-IP limit runs before the student lookup, so hitting it says
  // nothing about whether the student exists.
  if (funderIpHash) {
    const ipAttempts = await prisma.walletTopupAttempt.count({
      where: { funderIpHash, createdAt: { gte: new Date(now.getTime() - FUNDER_RATE_WINDOW_MS) } },
    });
    if (ipAttempts >= MAX_FUNDER_IP_ATTEMPTS_PER_WINDOW) {
      throw new WalletDomainError("RATE_LIMITED", "Too many funding attempts from this address.");
    }
  }

  const studentId = await resolveFundingRecipient(input.studentNumber, input.studentSurname);
  const config = resolvePaystackWalletTopupConfig();
  const origin: TopupOrigin = { kind: "funder", funderName, funderEmail, funderIpHash };

  let prepared: Awaited<ReturnType<typeof prepareTopupSnapshot>>;
  try {
    // Check the university before creating a wallet account, so a disabled
    // wallet never gains accounts on demand (D7). Phase A re-checks it.
    await assertUniversityWalletEnabled(prisma);
    await ensureStudentWalletAccount(studentId);
    prepared = await prepareTopupSnapshot({ studentId, origin, amountMinor, idempotencyKey, config, now });
  } catch (error) {
    if (error instanceof WalletDomainError && INELIGIBLE_RECIPIENT_CODES.has(error.code)) {
      throw recipientNotEligible(error.code, studentId);
    }
    throw error;
  }

  if (prepared.reuse) {
    return serializeFunderTopupAttempt(prepared.reuse);
  }

  const attempt = await initializeProviderCheckout({ attempt: prepared.snapshot, origin, payerEmail: funderEmail, config });
  return serializeFunderTopupAttempt(attempt);
}

async function findFunderAttempt(input: { topUpId: string; reference: string }) {
  // The (topUpId, reference) pair is the funder's only capability; both must
  // belong to the same funder attempt. Student-initiated attempts never match.
  const attempt = await prisma.walletTopupAttempt.findFirst({
    where: { id: input.topUpId, reference: input.reference, funderEmail: { not: null } },
    include: { walletTransaction: { select: { status: true, completedAt: true } } },
  });
  if (!attempt) throw new WalletDomainError("TOPUP_NOT_FOUND", "Top-up was not found.");
  return attempt;
}

export async function getFunderTopup(input: { topUpId: string; reference: string }): Promise<FunderTopupResult> {
  return serializeFunderTopupAttempt(await findFunderAttempt(input));
}

export async function reconcileFunderTopup(input: { topUpId: string; reference: string }): Promise<FunderTopupResult> {
  const attempt = await findFunderAttempt(input);
  // The student-facing result is discarded; the funder only ever sees the
  // re-read attempt through the funder serializer.
  await reconcileWalletTopup({ studentId: attempt.studentId, topUpId: attempt.id });
  return serializeFunderTopupAttempt(await findFunderAttempt(input));
}

export async function getWalletTopup(studentId: string, topUpId: string) {
  const attempt = await prisma.walletTopupAttempt.findFirst({
    where: { id: topUpId, studentId },
    include: {
      walletTransaction: true,
      student: { include: { walletAccount: { include: { balance: true } } } },
    },
  });
  if (!attempt) throw new WalletDomainError("TOPUP_NOT_FOUND", "Top-up was not found.");
  return serializeTopupAttempt(attempt);
}

/**
 * Best-effort student email once a funder's payment lands. It never throws:
 * the credit already stands and the webhook must still answer 200. If a crash
 * lands between crediting and the SUCCEEDED write, later reconciles return
 * early and this email is skipped (accepted limitation).
 */
async function notifyStudentOfFunding(attemptId: string) {
  try {
    const attempt = await prisma.walletTopupAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: {
        funderName: true,
        amountMinor: true,
        student: { select: { email: true, firstName: true, lastName: true } },
      },
    });
    if (!attempt.funderName) return;
    await sendFunderTopupReceivedEmail({
      to: attempt.student.email,
      studentName: `${attempt.student.firstName} ${attempt.student.lastName}`.trim(),
      funderName: attempt.funderName,
      amount: formatMoneyMinor(toSafeNumber(attempt.amountMinor)),
    });
  } catch {
    console.warn(`[funder-topup] student notification failed for attempt ${attemptId}`);
  }
}

export async function reconcileWalletTopup(input: {
  studentId: string;
  topUpId: string;
  config?: PaystackWalletTopupConfig;
  now?: Date;
}) {
  // Reconciliation is the only path that credits the wallet. Browser returns,
  // webhooks, and cron all verify the stored reference with Paystack first;
  // no caller-supplied success state is trusted.
  const now = input.now ?? new Date();
  const config = input.config ?? resolvePaystackWalletTopupConfig();
  const attempt = await prisma.walletTopupAttempt.findFirst({
    where: { id: input.topUpId, studentId: input.studentId },
    include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
  });

  if (!attempt) throw new WalletDomainError("TOPUP_NOT_FOUND", "Top-up was not found.");
  if (
    attempt.provider !== PAYSTACK_WALLET_PROVIDER ||
    attempt.providerAccountRef !== config.accountRef ||
    attempt.providerMode !== config.mode
  ) {
    throw new WalletDomainError("TOPUP_PROVIDER_MISMATCH", "Top-up provider configuration does not match.");
  }
  if (attempt.status === WalletTopupAttemptStatus.SUCCEEDED || attempt.walletTransaction.status === WalletTransactionStatus.COMPLETED) {
    return serializeTopupAttempt(attempt);
  }
  if (attempt.status === WalletTopupAttemptStatus.FAILED || attempt.walletTransaction.status === WalletTransactionStatus.FAILED) {
    return serializeTopupAttempt(attempt);
  }

  let verified;
  try {
    verified = await verifyTransaction(config.secretKey, config.baseUrl, attempt.reference);
  } catch (error) {
    if (!(error instanceof PaystackProviderError)) throw error;
    const updated = await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: {
        status: WalletTopupAttemptStatus.UNKNOWN,
        failureCode: null,
        lastCheckedAt: now,
      },
      include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
    });
    return serializeTopupAttempt(updated);
  }
  try {
    await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: { lastCheckedAt: now, providerTransactionId: verified.providerTransactionId },
    });
  } catch (error) {
    if (!hasPrismaErrorCode(error, "P2002")) throw error;
    const updated = await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: "DUPLICATE_PROVIDER_TRANSACTION" },
      include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
    });
    return serializeTopupAttempt(updated);
  }

  const terminalFailureStatuses = new Set(["failed", "abandoned", "reversed"]);
  if (terminalFailureStatuses.has(verified.status.toLowerCase())) {
    const updated = await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: { status: WalletTopupAttemptStatus.FAILED, failureCode: verified.status || "PAYSTACK_NOT_SUCCESSFUL" },
      include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
    });
    await prisma.walletTransaction.update({
      where: { id: attempt.walletTransactionId },
      data: { status: WalletTransactionStatus.FAILED, failedAt: now, failureCode: verified.status || "PAYSTACK_NOT_SUCCESSFUL" },
    });
    return serializeTopupAttempt(updated);
  }

  if (verified.status !== "success") {
    // Non-terminal provider statuses stay UNKNOWN so a later webhook or cron
    // sweep can observe the final outcome without losing the pending top-up.
    const updated = await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: null, lastCheckedAt: now },
      include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
    });
    return serializeTopupAttempt(updated);
  }

  const matches =
    verified.reference === attempt.reference &&
    verified.amountMinor === attempt.amountMinor &&
    verified.currency === attempt.currency &&
    verified.domain === config.mode;

  if (!matches) {
    const updated = await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: "PAYSTACK_VERIFICATION_MISMATCH" },
      include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
    });
    return serializeTopupAttempt(updated);
  }

  try {
    await prisma.walletTransaction.update({
      where: { id: attempt.walletTransactionId },
      data: { providerPaymentId: verified.providerTransactionId },
    });
  } catch (error) {
    if (!hasPrismaErrorCode(error, "P2002")) throw error;
    const updated = await prisma.walletTopupAttempt.update({
      where: { id: attempt.id },
      data: { status: WalletTopupAttemptStatus.UNKNOWN, failureCode: "DUPLICATE_PROVIDER_TRANSACTION" },
      include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
    });
    return serializeTopupAttempt(updated);
  }

  const completedAt = verified.paidAtIso ? new Date(verified.paidAtIso) : now;
  await completePendingTopup({
    walletTransactionId: attempt.walletTransactionId,
    studentAccountId: attempt.walletTransaction.initiatorAccountId!,
    completedAt,
  });

  // Conditional so that exactly one concurrent reconciler (browser return,
  // webhook or cron) observes the transition to SUCCEEDED.
  const { count } = await prisma.walletTopupAttempt.updateMany({
    where: { id: attempt.id, status: { not: WalletTopupAttemptStatus.SUCCEEDED } },
    data: { status: WalletTopupAttemptStatus.SUCCEEDED, completedAt, failureCode: null },
  });
  if (count === 1 && attempt.funderEmail) await notifyStudentOfFunding(attempt.id);

  const updated = await prisma.walletTopupAttempt.findUniqueOrThrow({
    where: { id: attempt.id },
    include: { walletTransaction: true, student: { include: { walletAccount: { include: { balance: true } } } } },
  });
  return serializeTopupAttempt(updated);
}

export async function reconcileWalletTopupByReference(input: {
  reference: string;
  config?: PaystackWalletTopupConfig;
  now?: Date;
}) {
  const attempt = await prisma.walletTopupAttempt.findUnique({
    where: { reference: input.reference },
    select: { id: true, studentId: true },
  });
  if (!attempt) {
    throw new WalletDomainError("TOPUP_NOT_FOUND", "Top-up was not found.");
  }
  return reconcileWalletTopup({
    studentId: attempt.studentId,
    topUpId: attempt.id,
    config: input.config,
    now: input.now,
  });
}

export async function reconcileStaleWalletTopups(now: Date = new Date()) {
  // Bounded sweep for cron/serverless use: reconcile old unresolved attempts
  // without letting one bad provider response block the rest of the batch.
  const cutoff = new Date(now.getTime() - STALE_TOPUP_MIN_AGE_SECONDS * 1000);
  const stale = await prisma.walletTopupAttempt.findMany({
    where: { status: { in: [WalletTopupAttemptStatus.PENDING, WalletTopupAttemptStatus.UNKNOWN] }, updatedAt: { lte: cutoff } },
    orderBy: { updatedAt: "asc" },
    take: RECONCILE_BATCH_SIZE,
    select: { id: true, studentId: true },
  });

  let confirmed = 0;
  let failed = 0;
  let unknown = 0;
  for (const attempt of stale) {
    try {
      const result = await reconcileWalletTopup({ studentId: attempt.studentId, topUpId: attempt.id, now });
      if (result.status === "SUCCEEDED") confirmed += 1;
      else if (result.status === "FAILED") failed += 1;
      else unknown += 1;
    } catch {
      unknown += 1;
    }
  }

  return { scanned: stale.length, confirmed, failed, unknown };
}
