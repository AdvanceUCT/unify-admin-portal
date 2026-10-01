/**
 * @fileoverview Notifies a vendor when its application is approved.
 * @module lib/email/vendor-application-approved
 */

import "server-only";

import { renderVendorApplicationApprovedEmail } from "./templates";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  sendResendEmail,
} from "@/lib/email/resend";

type SendVendorApplicationApprovedEmailInput = {
  to: string;
  contactName: string;
  companyName: string;
  portalUrl: string;
};

export async function sendVendorApplicationApprovedEmail({
  to,
  contactName,
  companyName,
  portalUrl,
}: SendVendorApplicationApprovedEmailInput): Promise<EmailDeliveryResult> {
  const input = { companyName, contactName, portalUrl, to };

  if (process.env.NODE_ENV !== "production") {
    console.info(
      [
        "Vendor application approved email delivery is using the development logger.",
        `To: ${contactName} <${to}>`,
        `Company: ${companyName}`,
        `Portal URL: ${portalUrl}`,
      ].join("\n"),
    );
    return { provider: "console" };
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send vendor application approved emails.");
  }

  return sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.AUTH_EMAIL_FROM,
    ...renderVendorApplicationApprovedEmail(input),
    to,
  });
}
