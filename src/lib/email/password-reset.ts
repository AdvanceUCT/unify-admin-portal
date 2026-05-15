import "server-only";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  escapeHtml,
  sendResendEmail,
} from "@/lib/email/resend";

type SendPasswordResetEmailInput = {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
};

function emailHtml(input: SendPasswordResetEmailInput) {
  const name = escapeHtml(input.name);
  const resetUrl = escapeHtml(input.resetUrl);

  return [
    `<p>Hi ${name},</p>`,
    "<p>A password reset was requested for your UNIFY Admin Portal account.</p>",
    `<p><a href="${resetUrl}">Reset your password</a></p>`,
    `<p>This link expires in ${input.expiresInMinutes} minutes.</p>`,
    "<p>If the button does not work, copy and open this link:</p>",
    `<p>${resetUrl}</p>`,
  ].join("\n");
}

function emailText(input: SendPasswordResetEmailInput) {
  return [
    `Hi ${input.name},`,
    "",
    "A password reset was requested for your UNIFY Admin Portal account.",
    `Reset your password: ${input.resetUrl}`,
    `This link expires in ${input.expiresInMinutes} minutes.`,
  ].join("\n");
}

export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
  expiresInMinutes,
}: SendPasswordResetEmailInput): Promise<EmailDeliveryResult> {
  const input = { expiresInMinutes, name, resetUrl, to };

  if (process.env.NODE_ENV !== "production") {
    console.info(
      [
        "Password reset email delivery is using the development logger.",
        `To: ${name} <${to}>`,
        `Expires in: ${expiresInMinutes} minutes`,
        `Reset URL: ${resetUrl}`,
      ].join("\n"),
    );
    return { provider: "console" };
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send password reset emails.");
  }

  return sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.AUTH_EMAIL_FROM,
    html: emailHtml(input),
    subject: "Reset your UNIFY Admin Portal password",
    text: emailText(input),
    to,
  });
}
