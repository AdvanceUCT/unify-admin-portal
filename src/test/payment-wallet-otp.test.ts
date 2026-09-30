import { createHash, createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  universityProfile: { findMany: vi.fn() },
  student: { findUnique: vi.fn() },
  credentialIssuance: { findFirst: vi.fn() },
  studentPaymentActivationChallenge: { findUnique: vi.fn(), updateMany: vi.fn() },
  studentPaymentSession: { create: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/config/env", () => ({ env: { PAYMENT_WALLET_TOPUPS_ENABLED: true, PAYMENT_OTP_BYPASS_ENABLED: false, PAYMENT_OTP_PEPPER: "ci-only-pepper" } }));
vi.mock("@/lib/payments/accounts", () => ({ ensureStudentWalletAccount: vi.fn() }));
import { verifyStudentPaymentActivation } from "@/lib/payments/walletSession";

const now = new Date("2026-09-30T12:00:00.000Z");
const input = { challengeId: "challenge-test", otp: "123456", deviceId: "device-test", now };
const challenge = {
  id: input.challengeId, studentId: "student-test", consumedAt: null, verifiedAt: null,
  expiresAt: new Date(now.getTime() + 600000), attemptCount: 0, maxAttempts: 5,
  deviceIdHash: createHash("sha256").update(input.deviceId).digest("hex"),
  otpHash: createHmac("sha256", "ci-only-pepper").update(`${input.challengeId}:${input.otp}`).digest("hex"),
};
describe("existing payment OTP activation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.universityProfile.findMany.mockResolvedValue([{ paymentWalletEnabled: true }]);
    database.student.findUnique.mockResolvedValue({ studentNumber: "STUDENTTEST" });
    database.credentialIssuance.findFirst.mockResolvedValue({ id: "credential-test" });
    database.studentPaymentActivationChallenge.findUnique.mockResolvedValue({ ...challenge });
    database.studentPaymentActivationChallenge.updateMany.mockResolvedValue({ count: 1 });
    database.studentPaymentSession.create.mockResolvedValue({ id: "session-test", accessTokenExpiresAt: new Date(now.getTime() + 900000), refreshTokenExpiresAt: new Date(now.getTime() + 2592000000) });
  });
  it.each([
    { expiresAt: now }, { deviceIdHash: "other-device" }, { attemptCount: 5 },
    { consumedAt: now }, { verifiedAt: now }, { otpHash: "00".repeat(32) }, { studentId: null },
  ])("rejects invalid challenges without creating a session: %j", async (change) => {
    database.studentPaymentActivationChallenge.findUnique.mockResolvedValue({ ...challenge, ...change });
    await expect(verifyStudentPaymentActivation(input)).rejects.toMatchObject({ code: "INVALID_WALLET_SESSION" });
    expect(database.studentPaymentSession.create).not.toHaveBeenCalled();
  });
  it("consumes the challenge conditionally before issuing hashed session tokens", async () => {
    const session = await verifyStudentPaymentActivation(input);
    expect(session.sessionId).toBe("session-test");
    expect(database.studentPaymentActivationChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ consumedAt: null, verifiedAt: null, attemptCount: { lt: 5 } }) }));
    expect(database.studentPaymentSession.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accessTokenHash: createHash("sha256").update(session.accessToken).digest("hex"), refreshTokenHash: createHash("sha256").update(session.refreshToken).digest("hex") }) }));
  });
  it("rejects a concurrent consumption loser", async () => {
    database.studentPaymentActivationChallenge.updateMany.mockResolvedValue({ count: 0 });
    await expect(verifyStudentPaymentActivation(input)).rejects.toMatchObject({ code: "INVALID_WALLET_SESSION" });
    expect(database.studentPaymentSession.create).not.toHaveBeenCalled();
  });
});
