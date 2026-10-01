import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const configuration = vi.hoisted(() => ({ env: { AUTH_EMAIL_FROM: "UNIFY Accounts <accounts@example.test>", CREDENTIAL_EMAIL_FROM: "UNIFY Credentials <credentials@example.test>", PAYMENT_OTP_EMAIL_FROM: "UNIFY Payments <payments@example.test>", PAYMENT_OTP_EMAIL_OVERRIDE_TO: undefined as string | undefined, PAYMENT_OTP_DEBUG_LOG_CODE: false, VENDOR_HELP_EMAIL_FROM: "UNIFY Help <help@example.test>", RESEND_API_KEY: "test-key", CREDENTIAL_EMAIL_DELIVERY_MODE: "resend", VENDOR_HELP_EMAIL_DELIVERY_MODE: "resend" } }));
vi.mock("@/lib/config/env", () => configuration);
vi.mock("@/lib/email/resend", () => ({ sendResendEmail: vi.fn(async () => ({ provider: "resend", messageId: "test-id" })) }));
import { sendResendEmail } from "@/lib/email/resend";
import { sendPaymentOtpEmail } from "@/lib/email/payment-otp";
import { sendCredentialActivationEmail } from "@/lib/email/credential-activation";
import { sendAdminInviteEmail } from "@/lib/email/admin-invites";
import { sendPasswordResetEmail } from "@/lib/email/password-reset";
import { sendVendorStaffInviteEmail } from "@/lib/email/vendor-staff-invites";
import { sendVendorApplicationSubmittedEmail } from "@/lib/email/vendor-application-submitted";
import { sendVendorApplicationApprovedEmail } from "@/lib/email/vendor-application-approved";
import { sendVendorApplicationRejectedEmail } from "@/lib/email/vendor-application-rejected";
import { sendVendorApplicationRevokedEmail } from "@/lib/email/vendor-application-revoked";
import { sendVendorHelpRequestEmail } from "@/lib/email/vendor-help";

const input = { to: "recipient@example.test", name: "Alex", contactName: "Alex", companyName: "Test Vendor", vendorName: "Test Vendor", expiresAt: new Date("2026-10-02T06:00:00Z") };
const url = "https://voskuils.com/activate?token=ci-only&next=%2Fwallet";
const cases = [
  { name: "OTP", from: configuration.env.PAYMENT_OTP_EMAIL_FROM, send: () => sendPaymentOtpEmail({ to: input.to, studentName: input.name, otp: "123456", challengeId: "challenge" }) },
  { name: "credential", from: configuration.env.CREDENTIAL_EMAIL_FROM, send: () => sendCredentialActivationEmail({ to: input.to, studentName: input.name, activationUrl: url, expiresAt: input.expiresAt.toISOString() }) },
  { name: "admin invite", from: configuration.env.AUTH_EMAIL_FROM, send: () => sendAdminInviteEmail({ ...input, inviteUrl: url }) },
  { name: "password reset", from: configuration.env.AUTH_EMAIL_FROM, send: () => sendPasswordResetEmail({ ...input, resetUrl: url, expiresInMinutes: 60 }) },
  { name: "staff invite", from: configuration.env.AUTH_EMAIL_FROM, send: () => sendVendorStaffInviteEmail({ ...input, inviteUrl: url }) },
  { name: "submitted", from: configuration.env.AUTH_EMAIL_FROM, send: () => sendVendorApplicationSubmittedEmail(input) },
  { name: "approved", from: configuration.env.AUTH_EMAIL_FROM, send: () => sendVendorApplicationApprovedEmail({ ...input, portalUrl: url }) },
  { name: "rejected", from: configuration.env.AUTH_EMAIL_FROM, send: () => sendVendorApplicationRejectedEmail({ ...input, reason: "Test reason", applicationUrl: url }) },
  { name: "revoked", from: configuration.env.AUTH_EMAIL_FROM, send: () => sendVendorApplicationRevokedEmail({ ...input, reason: "Test reason" }) },
  { name: "help", from: configuration.env.VENDOR_HELP_EMAIL_FROM, send: () => sendVendorHelpRequestEmail({ ...input, title: "Test help", details: "Two\nlines", submittedAt: input.expiresAt, submittedBy: { name: input.name, email: "submitter@example.test" }, vendor: {} }) },
];
describe("Wallet Signature sender compatibility", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NODE_ENV", "production"); configuration.env.PAYMENT_OTP_EMAIL_OVERRIDE_TO = undefined; vi.mocked(sendResendEmail).mockResolvedValue({ provider: "resend", messageId: "test-id" }); });
  afterEach(() => vi.unstubAllEnvs());
  it.each(cases)("preserves configured recipient/sender and provider result for $name", async item => {
    const result = await item.send();
    expect(sendResendEmail).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendResendEmail).mock.calls[0][0];
    expect(call).toMatchObject({ apiKey: "test-key", from: item.from, to: input.to });
    expect(call.html).toContain("email-heading"); expect(call.text).toContain("UNIFY");
    if (item.name !== "OTP") expect(result).toEqual({ provider: "resend", messageId: "test-id" });
    if (item.name === "help") expect(call.replyTo).toBe("submitter@example.test");
  });
  it.each(cases)("keeps delivery failures observable for $name", async item => {
    const failure = new Error("Simulated provider failure"); vi.mocked(sendResendEmail).mockRejectedValueOnce(failure);
    await expect(item.send()).rejects.toBe(failure);
  });
  it("retains the configured OTP test-recipient override", async () => {
    configuration.env.PAYMENT_OTP_EMAIL_OVERRIDE_TO = "override@example.test";
    await cases[0].send(); expect(sendResendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "override@example.test" }));
  });
});
