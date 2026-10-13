/**
 * @fileoverview Tells a student that an external funder's payment landed in their wallet.
 * @module lib/email/funder-topup
 */

import "server-only";

import { renderFunderTopupReceivedEmail } from "./templates";

import { env } from "@/lib/config/env";
import { type EmailDeliveryResult, sendResendEmail } from "@/lib/email/resend";

export async function sendFunderTopupReceivedEmail(input: {
  to: string;
  studentName: string;
  funderName: string;
  amount: string;
}): Promise<EmailDeliveryResult> {
  const message = renderFunderTopupReceivedEmail(input);

  if (process.env.NODE_ENV !== "production") {
    console.info(
      [
        "Funder top-up received email delivery is using the development logger.",
        `To: ${input.studentName} <${input.to}>`,
        `Subject: ${message.subject}`,
        message.text,
      ].join("\n"),
    );
    return { provider: "console" };
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send funder top-up emails.");
  }

  return sendResendEmail({ apiKey: env.RESEND_API_KEY, from: env.AUTH_EMAIL_FROM, ...message, to: input.to });
}
