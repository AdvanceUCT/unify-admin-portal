/**
 * @fileoverview Builds and sends password reset emails.
 * @module lib/email/password-reset
 */

import "server-only";

import { renderPasswordResetEmail } from "./templates";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  sendResendEmail,
} from "@/lib/email/resend";

type SendPasswordResetEmailInput = {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
};

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
    ...renderPasswordResetEmail(input),
    to,
  });
}
