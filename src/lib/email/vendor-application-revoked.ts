/**
 * @fileoverview Notifies a vendor when previously granted access is revoked.
 * @module lib/email/vendor-application-revoked
 */

import "server-only";

import { renderVendorApplicationRevokedEmail } from "./templates";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  sendResendEmail,
} from "@/lib/email/resend";

type SendVendorApplicationRevokedEmailInput = {
  to: string;
  contactName: string;
  companyName: string;
  reason: string;
};

export async function sendVendorApplicationRevokedEmail({
  to,
  contactName,
  companyName,
  reason,
}: SendVendorApplicationRevokedEmailInput): Promise<EmailDeliveryResult> {
  const input = { companyName, contactName, reason, to };

  if (process.env.NODE_ENV !== "production") {
    console.info(
      [
        "Vendor application revoked email delivery is using the development logger.",
        `To: ${contactName} <${to}>`,
        `Company: ${companyName}`,
        `Reason: ${reason}`,
      ].join("\n"),
    );
    return { provider: "console" };
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send vendor application revoked emails.");
  }

  return sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.AUTH_EMAIL_FROM,
    ...renderVendorApplicationRevokedEmail(input),
    to,
  });
}
