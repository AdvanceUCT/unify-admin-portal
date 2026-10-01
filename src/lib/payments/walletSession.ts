/**
 * @fileoverview Student payment-wallet activation challenges and bearer sessions.
 * @module lib/payments/walletSession
 */

import "server-only";

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { sendResendEmail, escapeHtml } from "@/lib/email/resend";
import { env } from "@/lib/config/env";
import { ensureStudentWalletAccount } from "@/lib/payments/accounts";
import { WalletDomainError } from "@/lib/payments/errors";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const ACTIVATION_RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_STUDENT_REQUESTS_PER_WINDOW = 5;
const MAX_DEVICE_REQUESTS_PER_WINDOW = 5;
const MAX_IP_REQUESTS_PER_WINDOW = 10;

type OtpTransaction = Prisma.TransactionClient;

function transactionConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string; originalCode?: string; meta?: unknown; cause?: unknown; driverAdapterError?: unknown };
  return ["P2034", "40001", "40P01"].includes(value.code ?? value.originalCode ?? "") ||
    [value.meta, value.cause, value.driverAdapterError].some(transactionConflict);
}

async function withOtpLocks<T>(keys: string[], now: Date | undefined, operation: (tx: OtpTransaction, time: Date) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        for (const key of [...new Set(keys)].sort()) {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-otp:${key}`}, 0))`;
        }
        const rows = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
        return operation(tx, now ?? rows[0].now);
      }, { maxWait: 10000, timeout: 15000 });
    } catch (error) {
      if (attempt >= 2 || !transactionConflict(error)) throw error;
    }
  }
}

type SessionTokenBundle = {
  accessToken: string;
  accessExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  sessionId: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(value: string) {
  const pepper = env.PAYMENT_OTP_PEPPER;
  if (!pepper) throw new WalletDomainError("PAYMENT_WALLET_DISABLED", "Payment OTP configuration is missing.");
  return createHmac("sha256", pepper).update(value, "utf8").digest("hex");
}

function safeEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeStudentNumber(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw new WalletDomainError("INVALID_POSTING", "Student number is required.");
  return normalized;
}

function normalizeDeviceId(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 256) {
    throw new WalletDomainError("INVALID_POSTING", "Device id is required.");
  }
  return normalized;
}

function generateOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function addMs(now: Date, ms: number) {
  return new Date(now.getTime() + ms);
}

function shouldLogPreviewOtpCode() {
  return env.PAYMENT_OTP_DEBUG_LOG_CODE;
}

function assertActivationEnabled() {
  if (!env.PAYMENT_WALLET_TOPUPS_ENABLED) {
    throw new WalletDomainError("PAYMENT_WALLET_DISABLED", "Payment wallet activation is disabled.");
  }
}

async function assertInstitutionPaymentWalletEnabled() {
  const profiles = await prisma.universityProfile.findMany({
    take: 2,
    select: { paymentWalletEnabled: true },
  });
  if (profiles.length !== 1 || !profiles[0].paymentWalletEnabled) {
    throw new WalletDomainError("PAYMENT_WALLET_DISABLED", "Payment wallet activation is disabled.");
  }
}

async function credentialStudentReferences(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { studentNumber: true },
  });
  return Array.from(new Set([studentId, student?.studentNumber].filter((value): value is string => Boolean(value))));
}

/** Requires an accepted/issued active credential before a student can activate payments. */
async function assertStudentPaymentEligible(studentId: string) {
  const studentReferences = await credentialStudentReferences(studentId);
  const eligibleCredential = await prisma.credentialIssuance.findFirst({
    where: {
      studentId: { in: studentReferences },
      status: { in: ["ACCEPTED", "ISSUED"] },
      OR: [
        { lifecycleStatus: null },
        { lifecycleStatus: "ACTIVE" },
      ],
    },
    select: { id: true },
  });
  if (!eligibleCredential) {
    throw new WalletDomainError(
      "PAYMENT_WALLET_NOT_ELIGIBLE",
      "Accept an active student credential before activating payments.",
    );
  }
}

function toTokenResponse(session: {
  id: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}, accessToken: string, refreshToken: string): SessionTokenBundle {
  return {
    accessToken,
    accessExpiresAt: session.accessTokenExpiresAt.toISOString(),
    refreshToken,
    refreshExpiresAt: session.refreshTokenExpiresAt.toISOString(),
    sessionId: session.id,
  };
}

async function sendPaymentOtpEmail(input: { to: string; otp: string; studentName: string; challengeId: string }) {
  if (!env.RESEND_API_KEY || !env.PAYMENT_OTP_EMAIL_FROM) {
    throw new WalletDomainError("PAYMENT_WALLET_DISABLED", "Payment OTP email configuration is missing.");
  }

  const safeName = escapeHtml(input.studentName);
  const safeOtp = escapeHtml(input.otp);
  const recipient = env.PAYMENT_OTP_EMAIL_OVERRIDE_TO ?? input.to;
  if (env.PAYMENT_OTP_EMAIL_OVERRIDE_TO) {
    console.warn("[wallet-activation] Sending payment OTP to configured test override recipient.");
  }
  const delivery = await sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.PAYMENT_OTP_EMAIL_FROM,
    to: recipient,
    subject: "Your UNIFY wallet activation code",
    text: `Your UNIFY wallet activation code is ${input.otp}. It expires in 10 minutes.`,
    html: `<p>Hi ${safeName},</p><p>Your UNIFY wallet activation code is <strong>${safeOtp}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
  if (shouldLogPreviewOtpCode()) {
    console.warn(
      `[wallet-activation] Preview OTP debug code for challenge ${input.challengeId}: ${input.otp} (delivery=${delivery.provider}:${delivery.messageId ?? "unknown"})`,
    );
  }
}

export async function requestStudentPaymentActivation(input: {
  studentNumber: string;
  deviceId: string;
  ipAddress?: string | null;
  now?: Date;
}): Promise<
  | {
      challengeId: string;
      expiresAt: string;
      resendAvailableAt: string;
      destinationHint: string | null;
    }
  | SessionTokenBundle
> {
  assertActivationEnabled();
  await assertInstitutionPaymentWalletEnabled();
  const now = input.now ?? new Date();
  const studentNumber = normalizeStudentNumber(input.studentNumber);
  const deviceId = normalizeDeviceId(input.deviceId);
  const deviceIdHash = sha256(deviceId);

  if (env.PAYMENT_OTP_BYPASS_ENABLED) {
    const student = await prisma.student.findUnique({
      where: { studentNumber },
      select: { id: true },
    });
    if (!student) {
      throw new WalletDomainError(
        "PAYMENT_WALLET_NOT_ELIGIBLE",
        "Accept an active student credential before activating payments.",
      );
    }
    await assertStudentPaymentEligible(student.id);
    await ensureStudentWalletAccount(student.id);
    console.warn("[wallet-activation] PAYMENT_OTP_BYPASS_ENABLED created a test payment session without OTP.");
    return createSession(student.id, deviceIdHash, now);
  }

  // Persist only HMACed lookup keys for student number/IP and a one-way device
  // hash. The OTP itself is also HMACed with its challenge id before storage.
  const studentNumberHash = hmac(`student:${studentNumber}`);
  const requestedIpHash = input.ipAddress ? hmac(`ip:${input.ipAddress}`) : null;
  const keys = [`student:${studentNumberHash}`, `device:${deviceIdHash}`, ...(requestedIpHash ? [`ip:${requestedIpHash}`] : [])];
  const { challenge, student, otp, challengeId } = await withOtpLocks(keys, input.now, async (tx, now) => {
  const windowStart = addMs(now, -ACTIVATION_RATE_WINDOW_MS);

  const [recentSameRequest, studentRequests, deviceRequests, ipRequests] = await Promise.all([
    tx.studentPaymentActivationChallenge.findFirst({
      where: {
        studentNumberHash,
        deviceIdHash,
        createdAt: { gt: addMs(now, -OTP_RESEND_COOLDOWN_MS) },
      },
      select: { id: true },
    }),
    tx.studentPaymentActivationChallenge.count({
      where: { studentNumberHash, createdAt: { gte: windowStart } },
    }),
    tx.studentPaymentActivationChallenge.count({
      where: { deviceIdHash, createdAt: { gte: windowStart } },
    }),
    requestedIpHash
      ? tx.studentPaymentActivationChallenge.count({
          where: { requestedIpHash, createdAt: { gte: windowStart } },
        })
      : Promise.resolve(0),
  ]);

  if (
    recentSameRequest ||
    studentRequests >= MAX_STUDENT_REQUESTS_PER_WINDOW ||
    deviceRequests >= MAX_DEVICE_REQUESTS_PER_WINDOW ||
    ipRequests >= MAX_IP_REQUESTS_PER_WINDOW
  ) {
    throw new WalletDomainError("RATE_LIMITED", "Please wait before requesting another activation code.");
  }

  // Supersede older active challenges for this same student/device pair so
  // only the latest delivered OTP can be used.
  await tx.studentPaymentActivationChallenge.updateMany({
    where: {
      studentNumberHash,
      deviceIdHash,
      consumedAt: null,
      verifiedAt: null,
      expiresAt: { gt: now },
    },
    data: { expiresAt: now },
  });

  const otp = generateOtp();
  const challengeId = `wact_${randomBytes(16).toString("hex")}`;

  const student = await tx.student.findUnique({
    where: { studentNumber },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  const challenge = await tx.studentPaymentActivationChallenge.create({
    data: {
      id: challengeId,
      studentId: student?.id,
      studentNumberHash,
      deviceIdHash,
      otpHash: hmac(`${challengeId}:${otp}`),
      destinationHint: "university email on record",
      expiresAt: addMs(now, OTP_TTL_MS),
      resendAvailableAt: addMs(now, OTP_RESEND_COOLDOWN_MS),
      maxAttempts: MAX_OTP_ATTEMPTS,
      requestedIpHash: requestedIpHash ?? undefined,
      createdAt: now,
    },
    select: { id: true, expiresAt: true, resendAvailableAt: true, destinationHint: true },
  });

  return { challenge, student, otp, challengeId };
  });

  if (student) {
    try {
      await sendPaymentOtpEmail({
        to: student.email,
        otp,
        studentName: `${student.firstName} ${student.lastName}`.trim() || "student",
        challengeId,
      });
    } catch (error) {
      // Expire immediately, retaining createdAt for cooldown and quota accounting.
      await prisma.studentPaymentActivationChallenge.updateMany({
        where: { id: challengeId, consumedAt: null, verifiedAt: null },
        data: { expiresAt: new Date(0) },
      });
      console.error("[wallet-activation] OTP delivery failed", { count: 1, errorType: error instanceof Error ? error.name : "unknown" });
      throw new WalletDomainError(
        "PAYMENT_OTP_DELIVERY_FAILED",
        "The code could not be sent. Wait 60 seconds before requesting a new code.",
      );
    }
  }

  return {
    challengeId: challenge.id,
    expiresAt: challenge.expiresAt.toISOString(),
    resendAvailableAt: challenge.resendAvailableAt.toISOString(),
    destinationHint: challenge.destinationHint,
  };
}

async function createSession(studentId: string, deviceIdHash: string, now: Date) {
  const accessToken = generateOpaqueToken();
  const refreshToken = generateOpaqueToken();
  const session = await prisma.studentPaymentSession.create({
    data: {
      studentId,
      deviceIdHash,
      accessTokenHash: sha256(accessToken),
      accessTokenExpiresAt: addMs(now, ACCESS_TTL_MS),
      refreshTokenHash: sha256(refreshToken),
      refreshTokenExpiresAt: addMs(now, REFRESH_TTL_MS),
      lastUsedAt: now,
    },
    select: { id: true, accessTokenExpiresAt: true, refreshTokenExpiresAt: true },
  });

  return toTokenResponse(session, accessToken, refreshToken);
}

export async function verifyStudentPaymentActivation(input: {
  challengeId: string;
  otp: string;
  deviceId: string;
  now?: Date;
}): Promise<SessionTokenBundle> {
  assertActivationEnabled();
  await assertInstitutionPaymentWalletEnabled();
  const now = input.now ?? new Date();
  const challengeId = input.challengeId.trim();
  const otp = input.otp.trim();
  const deviceIdHash = sha256(normalizeDeviceId(input.deviceId));

  if (!challengeId || !/^\d{6}$/.test(otp)) {
    throw new WalletDomainError("INVALID_WALLET_SESSION", "Invalid activation code.");
  }

  const initial = await prisma.studentPaymentActivationChallenge.findUnique({ where: { id: challengeId } });
  if (!initial) throw new WalletDomainError("INVALID_WALLET_SESSION", "Invalid activation code.");
  const studentId = await withOtpLocks([`student:${initial.studentNumberHash}`, `device:${initial.deviceIdHash}`], input.now, async (tx, time) => {
    const challenge = await tx.studentPaymentActivationChallenge.findUnique({ where: { id: challengeId } });
    const invalid = !challenge || !challenge.studentId || challenge.consumedAt || challenge.verifiedAt ||
      challenge.expiresAt <= time || challenge.deviceIdHash !== deviceIdHash ||
      challenge.attemptCount >= challenge.maxAttempts || !safeEqualHex(challenge.otpHash, hmac(`${challengeId}:${otp}`));
    if (invalid) {
      if (challenge && !challenge.consumedAt && !challenge.verifiedAt) {
        await tx.studentPaymentActivationChallenge.updateMany({
          where: { id: challenge.id, attemptCount: { lt: challenge.maxAttempts } },
          data: { attemptCount: { increment: 1 } },
        });
      }
      return null;
    }
    await assertStudentPaymentEligible(challenge.studentId!);
    const consumed = await tx.studentPaymentActivationChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, verifiedAt: null, expiresAt: { gt: time }, attemptCount: { lt: challenge.maxAttempts } },
      data: { attemptCount: { increment: 1 }, verifiedAt: time, consumedAt: time },
    });
    return consumed.count === 1 ? challenge.studentId : null;
  });
  if (!studentId) throw new WalletDomainError("INVALID_WALLET_SESSION", "Invalid activation code.");

  await ensureStudentWalletAccount(studentId);
  return createSession(studentId, deviceIdHash, now);
}

export async function refreshStudentPaymentSession(input: {
  refreshToken: string;
  sessionId: string;
  deviceId: string;
  now?: Date;
}): Promise<SessionTokenBundle> {
  const now = input.now ?? new Date();
  const presentedRefreshToken = input.refreshToken.trim();
  const sessionId = input.sessionId.trim();
  if (!presentedRefreshToken || !sessionId) {
    throw new WalletDomainError("INVALID_WALLET_SESSION", "Invalid wallet session.");
  }
  const refreshTokenHash = sha256(presentedRefreshToken);
  const session = await prisma.studentPaymentSession.findUnique({ where: { id: sessionId } });

  if (!session) {
    throw new WalletDomainError("INVALID_WALLET_SESSION", "Invalid wallet session.");
  }

  if (session.revokedAt || session.refreshReusedAt || session.refreshTokenExpiresAt <= now) {
    if (!session.revokedAt) {
      await prisma.studentPaymentSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
    }
    throw new WalletDomainError("INVALID_WALLET_SESSION", "Invalid wallet session.");
  }

  if (session.deviceIdHash !== sha256(normalizeDeviceId(input.deviceId))) {
    throw new WalletDomainError("INVALID_WALLET_SESSION", "Invalid wallet session.");
  }

  if (session.refreshTokenHash !== refreshTokenHash) {
    // A refresh-token mismatch on an existing session is treated as reuse or
    // theft: revoke the whole session family rather than issuing new tokens.
    await prisma.studentPaymentSession.update({
      where: { id: session.id },
      data: { revokedAt: now, refreshReusedAt: now },
    });
    throw new WalletDomainError("INVALID_WALLET_SESSION", "Invalid wallet session.");
  }

  const accessToken = generateOpaqueToken();
  const nextRefreshToken = generateOpaqueToken();
  // Rotate the refresh token atomically. If another request already rotated
  // it, mark the session reused so both racing clients must re-authenticate.
  const rotated = await prisma.studentPaymentSession.updateMany({
    where: { id: session.id, refreshTokenHash, revokedAt: null, refreshReusedAt: null },
    data: {
      accessTokenHash: sha256(accessToken),
      accessTokenExpiresAt: addMs(now, ACCESS_TTL_MS),
      refreshTokenHash: sha256(nextRefreshToken),
      refreshTokenExpiresAt: addMs(now, REFRESH_TTL_MS),
      lastUsedAt: now,
    },
  });
  if (rotated.count !== 1) {
    await prisma.studentPaymentSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: now, refreshReusedAt: now },
    });
    throw new WalletDomainError("INVALID_WALLET_SESSION", "Invalid wallet session.");
  }

  const updated = await prisma.studentPaymentSession.findUniqueOrThrow({
    where: { id: session.id },
    select: { id: true, accessTokenExpiresAt: true, refreshTokenExpiresAt: true },
  });

  return toTokenResponse(updated, accessToken, nextRefreshToken);
}

export async function authenticateWalletBearer(request: Request, now: Date = new Date()) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new WalletDomainError("INVALID_WALLET_SESSION", "Missing wallet bearer token.");

  // Access tokens are opaque to clients and stored only as SHA-256 hashes, so
  // a database read cannot recover a bearer token.
  const accessTokenHash = sha256(match[1].trim());
  const session = await prisma.studentPaymentSession.findUnique({
    where: { accessTokenHash },
    include: { student: { include: { walletAccount: { include: { balance: true } } } } },
  });

  if (!session || session.revokedAt || session.accessTokenExpiresAt <= now) {
    throw new WalletDomainError("INVALID_WALLET_SESSION", "Invalid wallet session.");
  }

  await prisma.studentPaymentSession.update({
    where: { id: session.id },
    data: { lastUsedAt: now },
  });

  return {
    sessionId: session.id,
    studentId: session.studentId,
    student: session.student,
  };
}

export async function revokeStudentPaymentSession(input: { sessionId: string; now?: Date }) {
  const now = input.now ?? new Date();
  await prisma.studentPaymentSession.updateMany({
    where: { id: input.sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
}
