/**
 * @fileoverview Notifies a vendor when its application is rejected.
 * @module lib/email/vendor-application-rejected
 */

import "server-only";

import { renderVendorApplicationRejectedEmail } from "./templates";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  sendResendEmail,
} from "@/lib/email/resend";

type SendVendorApplicationRejectedEmailInput = {
  to: string;
  contactName: string;
  companyName: string;
  reason: string;
  applicationUrl: string;
};

export async function sendVendorApplicationRejectedEmail({
  to,
  contactName,
  companyName,
  reason,
  applicationUrl,
}: SendVendorApplicationRejectedEmailInput): Promise<EmailDeliveryResult> {
  const input = { applicationUrl, companyName, contactName, reason, to };

  if (process.env.NODE_ENV !== "production") {
    console.info(
      [
        "Vendor application rejected email delivery is using the development logger.",
        `To: ${contactName} <${to}>`,
        `Company: ${companyName}`,
        `Reason: ${reason}`,
      ].join("\n"),
    );
    return { provider: "console" };
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send vendor application rejected emails.");
  }

  return sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.AUTH_EMAIL_FROM,
    ...renderVendorApplicationRejectedEmail(input),
    to,
  });
}
