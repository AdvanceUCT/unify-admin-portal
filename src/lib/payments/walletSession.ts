/**
 * @fileoverview Student payment-wallet activation challenges and bearer sessions.
 * @module lib/payments/walletSession
 */

import "server-only";

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

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
  await sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.PAYMENT_OTP_EMAIL_FROM,
    to: recipient,
    subject: "Your UNIFY wallet activation code",
    text: `Your UNIFY wallet activation code is ${input.otp}. It expires in 10 minutes.`,
    html: `<p>Hi ${safeName},</p><p>Your UNIFY wallet activation code is <strong>${safeOtp}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
}

export async function requestStudentPaymentActivation(input: {
  studentNumber: string;
  deviceId: string;
  ipAddress?: string | null;
  now?: Date;
}) {
  assertActivationEnabled();
  await assertInstitutionPaymentWalletEnabled();
  const now = input.now ?? new Date();
  const studentNumber = normalizeStudentNumber(input.studentNumber);
  const deviceId = normalizeDeviceId(input.deviceId);
  const studentNumberHash = hmac(`student:${studentNumber}`);
  const deviceIdHash = sha256(deviceId);
  const requestedIpHash = input.ipAddress ? hmac(`ip:${input.ipAddress}`) : null;
  const windowStart = addMs(now, -ACTIVATION_RATE_WINDOW_MS);

  const [recentSameRequest, studentRequests, deviceRequests, ipRequests] = await Promise.all([
    prisma.studentPaymentActivationChallenge.findFirst({
      where: {
        studentNumberHash,
        deviceIdHash,
        createdAt: { gte: addMs(now, -OTP_RESEND_COOLDOWN_MS) },
      },
      select: { id: true },
    }),
    prisma.studentPaymentActivationChallenge.count({
      where: { studentNumberHash, createdAt: { gte: windowStart } },
    }),
    prisma.studentPaymentActivationChallenge.count({
      where: { deviceIdHash, createdAt: { gte: windowStart } },
    }),
    requestedIpHash
      ? prisma.studentPaymentActivationChallenge.count({
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

  await prisma.studentPaymentActivationChallenge.updateMany({
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

  const student = await prisma.student.findUnique({
    where: { studentNumber },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  const challenge = await prisma.studentPaymentActivationChallenge.create({
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
    },
    select: { id: true, expiresAt: true, resendAvailableAt: true, destinationHint: true },
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
      console.error("[wallet-activation] Failed to send payment OTP email:", error);
      throw new WalletDomainError(
        "PAYMENT_OTP_DELIVERY_FAILED",
        "The activation code could not be sent. Check the payment OTP email configuration and try again.",
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

  const challenge = await prisma.studentPaymentActivationChallenge.findUnique({ where: { id: challengeId } });
  const presentedHash = hmac(`${challengeId}:${otp}`);

  const invalidActivation = Boolean(
    !challenge ||
    !challenge.studentId ||
    challenge.consumedAt ||
    challenge.verifiedAt ||
    challenge.expiresAt <= now ||
    challenge.deviceIdHash !== deviceIdHash ||
    challenge.attemptCount >= challenge.maxAttempts ||
    !safeEqualHex(challenge.otpHash, presentedHash)
  );

  if (invalidActivation) {
    if (challenge && !challenge.consumedAt && !challenge.verifiedAt) {
      await prisma.studentPaymentActivationChallenge.updateMany({
        where: { id: challenge.id, attemptCount: { lt: challenge.maxAttempts } },
        data: { attemptCount: { increment: 1 } },
      });
    }
    throw new WalletDomainError("INVALID_WALLET_SESSION", "Invalid activation code.");
  }
  if (!challenge?.studentId) {
    throw new WalletDomainError("INVALID_WALLET_SESSION", "Invalid activation code.");
  }
  const studentId = challenge.studentId;

  const eligibleCredential = await prisma.credentialIssuance.findFirst({
    where: {
      studentId,
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

  const consumed = await prisma.studentPaymentActivationChallenge.updateMany({
    where: {
      id: challenge.id,
      consumedAt: null,
      verifiedAt: null,
      expiresAt: { gt: now },
      attemptCount: { lt: challenge.maxAttempts },
    },
    data: { attemptCount: { increment: 1 }, verifiedAt: now, consumedAt: now },
  });
  if (consumed.count !== 1) {
    throw new WalletDomainError("INVALID_WALLET_SESSION", "Invalid activation code.");
  }

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
    await prisma.studentPaymentSession.update({
      where: { id: session.id },
      data: { revokedAt: now, refreshReusedAt: now },
    });
    throw new WalletDomainError("INVALID_WALLET_SESSION", "Invalid wallet session.");
  }

  const accessToken = generateOpaqueToken();
  const nextRefreshToken = generateOpaqueToken();
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
