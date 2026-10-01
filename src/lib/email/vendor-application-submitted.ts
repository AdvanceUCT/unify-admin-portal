/**
 * @fileoverview Acknowledges a newly submitted vendor application.
 * @module lib/email/vendor-application-submitted
 */

import "server-only";

import { renderVendorApplicationSubmittedEmail } from "./templates";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  sendResendEmail,
} from "@/lib/email/resend";

type SendVendorApplicationSubmittedEmailInput = {
  to: string;
  contactName: string;
  companyName: string;
};

export async function sendVendorApplicationSubmittedEmail({
  to,
  contactName,
  companyName,
}: SendVendorApplicationSubmittedEmailInput): Promise<EmailDeliveryResult> {
  const input = { companyName, contactName, to };

  if (process.env.NODE_ENV !== "production") {
    console.info(
      [
        "Vendor application submitted email delivery is using the development logger.",
        `To: ${contactName} <${to}>`,
        `Company: ${companyName}`,
      ].join("\n"),
    );
    return { provider: "console" };
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send vendor application submitted emails.");
  }

  return sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.AUTH_EMAIL_FROM,
    ...renderVendorApplicationSubmittedEmail(input),
    to,
  });
}
