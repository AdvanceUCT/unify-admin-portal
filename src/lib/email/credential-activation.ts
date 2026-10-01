/**
 * @fileoverview Builds and sends student credential activation emails.
 * @module lib/email/credential-activation
 */

import "server-only";

import { renderCredentialActivationEmail } from "./templates";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
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
    ...renderCredentialActivationEmail(input),
    to: input.to,
  });
}
