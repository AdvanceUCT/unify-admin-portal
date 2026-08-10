/**
 * @fileoverview Builds and sends student credential activation emails.
 * @module lib/email/credential-activation
 */

import "server-only";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  escapeHtml,
  sendResendEmail,
} from "@/lib/email/resend";

type SendCredentialActivationEmailInput = {
  activationUrl: string;
  expiresAt: string;
  studentName: string;
  to: string;
};

export type CredentialActivationEmailResult = EmailDeliveryResult;

function shouldUseConsoleDelivery() {
  return (
    env.CREDENTIAL_EMAIL_DELIVERY_MODE === "console" ||
    (!env.RESEND_API_KEY && process.env.NODE_ENV !== "production")
  );
}

function emailHtml(input: SendCredentialActivationEmailInput) {
  const activationUrl = escapeHtml(input.activationUrl);
  const studentName = escapeHtml(input.studentName);

  return [
    `<p>Hi ${studentName},</p>`,
    "<p>Your UNIFY student credential is ready to activate in the Student Wallet.</p>",
    `<p><a href="${activationUrl}">Open your credential activation link</a></p>`,
    `<p>This link expires at ${new Date(input.expiresAt).toLocaleString()}.</p>`,
    "<p>If the button does not open the wallet, copy and open this link on the device with the Student Wallet installed:</p>",
    `<p>${activationUrl}</p>`,
  ].join("\n");
}

function emailText(input: SendCredentialActivationEmailInput) {
  return [
    `Hi ${input.studentName},`,
    "",
    "Your UNIFY student credential is ready to activate in the Student Wallet.",
    `Open this link on the device with the Student Wallet installed: ${input.activationUrl}`,
    `This link expires at ${new Date(input.expiresAt).toISOString()}.`,
  ].join("\n");
}

export async function sendCredentialActivationEmail(
  input: SendCredentialActivationEmailInput,
): Promise<CredentialActivationEmailResult> {
  const from = env.CREDENTIAL_EMAIL_FROM ?? env.AUTH_EMAIL_FROM;

  if (shouldUseConsoleDelivery()) {
    console.info(
      [
        "Credential activation email delivery is using the development logger.",
        `To: ${input.studentName} <${input.to}>`,
        `Expires: ${input.expiresAt}`,
        `Activation URL: ${input.activationUrl}`,
      ].join("\n"),
    );
    return { provider: "console" };
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send credential activation emails.");
  }

  return sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from,
    html: emailHtml(input),
    subject: "Activate your UNIFY student credential",
    text: emailText(input),
    to: input.to,
  });
}
