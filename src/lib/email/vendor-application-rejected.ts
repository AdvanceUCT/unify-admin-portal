import "server-only";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  escapeHtml,
  sendResendEmail,
} from "@/lib/email/resend";

type SendVendorApplicationRejectedEmailInput = {
  to: string;
  contactName: string;
  companyName: string;
  reason: string;
  applicationUrl: string;
};

function emailHtml(input: SendVendorApplicationRejectedEmailInput) {
  const contactName = escapeHtml(input.contactName);
  const companyName = escapeHtml(input.companyName);
  const reason = escapeHtml(input.reason);
  const applicationUrl = escapeHtml(input.applicationUrl);

  return [
    `<p>Hi ${contactName},</p>`,
    `<p>${companyName}'s application to become a UNIFY credential verifier was not approved at this time.</p>`,
    `<p><strong>Reason:</strong> ${reason}</p>`,
    "<p>You're welcome to address the feedback and submit a new application.</p>",
    `<p><a href="${applicationUrl}">View your application</a></p>`,
  ].join("\n");
}

function emailText(input: SendVendorApplicationRejectedEmailInput) {
  return [
    `Hi ${input.contactName},`,
    "",
    `${input.companyName}'s application to become a UNIFY credential verifier was not approved at this time.`,
    `Reason: ${input.reason}`,
    "You're welcome to address the feedback and submit a new application.",
    `View your application: ${input.applicationUrl}`,
  ].join("\n");
}

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
    html: emailHtml(input),
    subject: "An update on your UNIFY verifier application",
    text: emailText(input),
    to,
  });
}
