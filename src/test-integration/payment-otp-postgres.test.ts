import { createHash, createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("@/lib/config/env", () => ({ env: { DATABASE_URL: process.env.DATABASE_URL, PAYMENT_WALLET_TOPUPS_ENABLED: true, PAYMENT_OTP_PEPPER: "isolated-otp-test-pepper" } }));
import { prisma } from "@/lib/db/prisma";
import { verifyStudentPaymentActivation } from "@/lib/payments/walletSession";
const studentId = `otp-${randomUUID()}`;
const deviceId = "isolated-ci-device";
const otp = "123456";
const now = new Date("2026-09-30T12:00:00Z");
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  if (url.pathname !== "/unify_wallet_test" || process.env.NODE_ENV === "production") throw new Error("OTP tests require the isolated CI database.");
  const profiles = await prisma.universityProfile.findMany();
  if (!profiles.length) await prisma.universityProfile.create({ data: { id: "pos-test-university", name: "Test", abbreviation: "TEST", contactEmail: "test@example.invalid", paymentWalletEnabled: true } });
  await prisma.student.create({ data: { id: studentId, studentNumber: studentId, email: "ci@example.invalid", firstName: "CI", lastName: "OTP" } });
  await prisma.credentialIssuance.create({ data: { studentId, credentialDefinitionId: "ci-only", status: "ACCEPTED", lifecycleStatus: "ACTIVE", credentialValidFrom: new Date("2020-01-01Z"), credentialExpiresAt: new Date("2099-01-01Z") } });
});
afterAll(async () => { await prisma.$disconnect(); });
it("issues exactly one session when the same OTP is verified concurrently", async () => {
  const id = `challenge-${randomUUID()}`;
  await prisma.studentPaymentActivationChallenge.create({ data: { id, studentId, studentNumberHash: createHash("sha256").update(studentId).digest("hex"), deviceIdHash: createHash("sha256").update(deviceId).digest("hex"), otpHash: createHmac("sha256", "isolated-otp-test-pepper").update(`${id}:${otp}`).digest("hex"), expiresAt: new Date(now.getTime() + 600000), resendAvailableAt: new Date(now.getTime() + 60000) } });
  const results = await Promise.allSettled([verifyStudentPaymentActivation({ challengeId: id, otp, deviceId, now }), verifyStudentPaymentActivation({ challengeId: id, otp, deviceId, now })]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  expect(await prisma.studentPaymentSession.count({ where: { studentId } })).toBe(1);
  const stored = await prisma.studentPaymentActivationChallenge.findUniqueOrThrow({ where: { id } });
  expect(stored.consumedAt).toEqual(now);
});
