import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("@/lib/config/env", () => ({ env: { DATABASE_URL: process.env.DATABASE_URL, PAYMENT_WALLET_TOPUPS_ENABLED: true, PAYMENT_OTP_PEPPER: "ci-only-otp-pepper", PAYMENT_OTP_EMAIL_FROM: "ci@example.invalid", RESEND_API_KEY: "ci-only" } }));
vi.mock("@/lib/email/resend", () => ({ sendResendEmail: vi.fn(async () => ({ provider: "test" })), escapeHtml: (value: string) => value }));
import { sendResendEmail } from "@/lib/email/resend";
import { prisma } from "@/lib/db/prisma";
import { requestStudentPaymentActivation } from "@/lib/payments/walletSession";
const now = new Date("2026-10-01T10:00:00Z");
const request = (studentNumber: string, deviceId: string, ipAddress?: string, time = now) => requestStudentPaymentActivation({ studentNumber, deviceId, ipAddress, now: time });
function challenge(value: Awaited<ReturnType<typeof request>>) {
  if (!("challengeId" in value)) throw new Error("Expected OTP challenge");
  return value;
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  if (url.pathname !== "/unify_wallet_test" || process.env.NODE_ENV === "production") throw new Error("Requires isolated CI database");
  if (!await prisma.universityProfile.count()) await prisma.universityProfile.create({ data: { name: "CI", abbreviation: "CI", contactEmail: "ci@example.invalid", paymentWalletEnabled: true } });
});
afterAll(async () => prisma.$disconnect());
it("serializes simultaneous requests and resends, including exact cooldown boundary", async () => {
  const student = randomUUID(), device = randomUUID();
  const first = await Promise.allSettled(Array.from({ length: 8 }, () => request(student, device)));
  expect(first.filter(result => result.status === "fulfilled")).toHaveLength(1);
  const old = challenge((first.find(result => result.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof request>>>).value);
  const time = new Date(now.getTime() + 60000);
  const next = await Promise.allSettled(Array.from({ length: 8 }, () => request(student, device, undefined, time)));
  expect(next.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect((await prisma.studentPaymentActivationChallenge.findUniqueOrThrow({ where: { id: old.challengeId } })).expiresAt).toEqual(time);
});
it.each(["student", "device", "ip"])("enforces shared %s quota under concurrent different pairs", async (kind) => {
  const key = randomUUID();
  const results = await Promise.allSettled(Array.from({ length: 14 }, () => request(kind === "student" ? key : randomUUID(), kind === "device" ? key : randomUUID(), kind === "ip" ? key : undefined)));
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(kind === "ip" ? 10 : 5);
});
it("invalidates a failed delivery, keeps cooldown, and permits a fresh code", async () => {
  const student = randomUUID(), device = randomUUID();
  await prisma.student.create({ data: { id: student, studentNumber: student.toUpperCase(), email: "ci@example.invalid", firstName: "CI", lastName: "OTP" } });
  vi.mocked(sendResendEmail).mockRejectedValueOnce(new Error("delivery unavailable"));
  await expect(request(student, device)).rejects.toMatchObject({ code: "PAYMENT_OTP_DELIVERY_FAILED" });
  const failed = await prisma.studentPaymentActivationChallenge.findFirstOrThrow({ where: { studentId: student } });
  expect(failed.expiresAt).toEqual(new Date(0));
  await expect(request(student, device)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  const fresh = challenge(await request(student, device, undefined, new Date(now.getTime() + 60000)));
  expect(fresh.challengeId).not.toBe(failed.id);
});
it("a delayed failure cannot expire a newer replacement", async () => {
  const student = randomUUID(), device = randomUUID();
  await prisma.student.create({ data: { id: student, studentNumber: student.toUpperCase(), email: "ci@example.invalid", firstName: "CI", lastName: "OTP" } });
  let fail!: (error: Error) => void;
  let started!: () => void;
  const deliveryStarted = new Promise<void>(resolve => { started = resolve; });
  vi.mocked(sendResendEmail).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; started(); }));
  const pending = request(student, device).catch(error => error);
  await deliveryStarted;
  const newer = challenge(await request(student, device, undefined, new Date(now.getTime() + 60000)));
  fail(new Error("late delivery failure"));
  expect(await pending).toMatchObject({ code: "PAYMENT_OTP_DELIVERY_FAILED" });
  expect((await prisma.studentPaymentActivationChallenge.findUniqueOrThrow({ where: { id: newer.challengeId } })).expiresAt).toEqual(new Date(now.getTime() + 660000));
});
