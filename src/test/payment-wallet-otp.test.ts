import { createHash, createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  universityProfile: { findMany: vi.fn() },
  student: { findUnique: vi.fn() },
  credentialIssuance: { findFirst: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  studentPaymentActivationChallenge: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  studentPaymentSession: { create: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: database }));
vi.mock("@/lib/config/env", () => ({ env: { PAYMENT_WALLET_TOPUPS_ENABLED: true, PAYMENT_OTP_BYPASS_ENABLED: false, PAYMENT_OTP_PEPPER: "ci-only-pepper", RESEND_API_KEY: "ci-only-key", PAYMENT_OTP_EMAIL_FROM: "test@example.test" } }));
vi.mock("@/lib/email/resend", () => ({ sendResendEmail: vi.fn(async () => ({ provider: "test", messageId: "test" })), escapeHtml: (value: string) => value }));
import { sendResendEmail } from "@/lib/email/resend";
vi.mock("@/lib/payments/accounts", () => ({ ensureStudentWalletAccount: vi.fn() }));
import { requestStudentPaymentActivation, verifyStudentPaymentActivation } from "@/lib/payments/walletSession";

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
    database.$transaction.mockImplementation(async (fn) => fn(database));
    database.$queryRaw.mockResolvedValue([{ now }]);
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

describe("Payment OTP request and resend", () => {
  const request = { studentNumber: " studenttest ", deviceId: "device-test", ipAddress: "192.0.2.1", now };
  beforeEach(() => {
    vi.clearAllMocks();
    database.$transaction.mockImplementation(async (fn) => fn(database));
    database.$queryRaw.mockResolvedValue([{ now }]);
    database.universityProfile.findMany.mockResolvedValue([{ paymentWalletEnabled: true }]);
    database.student.findUnique.mockResolvedValue({ id: "student-test", email: "student@example.test", firstName: "Student", lastName: "Test" });
    database.studentPaymentActivationChallenge.findFirst.mockResolvedValue(null);
    database.studentPaymentActivationChallenge.count.mockResolvedValue(0);
    database.studentPaymentActivationChallenge.updateMany.mockResolvedValue({ count: 1 });
    database.studentPaymentActivationChallenge.create.mockImplementation(async ({ data }) => data);
    vi.mocked(sendResendEmail).mockResolvedValue({ provider: "resend", messageId: "test" });
  });
  it("emails a six-digit code and persists only its hash with the existing expiry/cooldown", async () => {
    const result = await requestStudentPaymentActivation(request);
    expect(result).toMatchObject({ expiresAt: new Date(now.getTime() + 600000).toISOString(), resendAvailableAt: new Date(now.getTime() + 60000).toISOString() });
    const email = vi.mocked(sendResendEmail).mock.calls[0][0];
    const otp = email.text!.match(/code is (\d{6})/)![1];
    const data = database.studentPaymentActivationChallenge.create.mock.calls[0][0].data;
    expect(data.otpHash).toBe(createHmac("sha256", "ci-only-pepper").update(`${data.id}:${otp}`).digest("hex"));
    expect(data).not.toHaveProperty("otp"); expect(data).not.toHaveProperty("studentNumber");
    expect(database.studentPaymentSession.create).not.toHaveBeenCalled();
  });
  it("blocks requests during cooldown without replacing a challenge or sending email", async () => {
    database.studentPaymentActivationChallenge.findFirst.mockResolvedValue({ id: "recent" });
    await expect(requestStudentPaymentActivation(request)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(sendResendEmail).not.toHaveBeenCalled(); expect(database.studentPaymentActivationChallenge.updateMany).not.toHaveBeenCalled();
  });
  it("blocks excessive requests", async () => {
    database.studentPaymentActivationChallenge.count.mockResolvedValue(10);
    await expect(requestStudentPaymentActivation(request)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(sendResendEmail).not.toHaveBeenCalled();
  });
  it("supersedes older active challenges for the same student/device on resend", async () => {
    await requestStudentPaymentActivation(request);
    expect(database.studentPaymentActivationChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ deviceIdHash: challenge.deviceIdHash, consumedAt: null, verifiedAt: null }), data: { expiresAt: now } }));
  });
  it("reports delivery failure without issuing a session", async () => {
    vi.mocked(sendResendEmail).mockRejectedValueOnce(new Error("test delivery failure"));
    await expect(requestStudentPaymentActivation(request)).rejects.toMatchObject({ code: "PAYMENT_OTP_DELIVERY_FAILED" });
    expect(database.studentPaymentSession.create).not.toHaveBeenCalled();
  });
  it("does not disclose an unknown student through its challenge response", async () => {
    database.student.findUnique.mockResolvedValue(null);
    expect(await requestStudentPaymentActivation(request)).toMatchObject({ destinationHint: "university email on record" });
    expect(sendResendEmail).not.toHaveBeenCalled();
  });
});
