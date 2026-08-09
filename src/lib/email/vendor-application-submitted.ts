import "server-only";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  escapeHtml,
  sendResendEmail,
} from "@/lib/email/resend";

type SendVendorApplicationSubmittedEmailInput = {
  to: string;
  contactName: string;
  companyName: string;
};

function emailHtml(input: SendVendorApplicationSubmittedEmailInput) {
  const contactName = escapeHtml(input.contactName);
  const companyName = escapeHtml(input.companyName);

  return [
    `<p>Hi ${contactName},</p>`,
    `<p>We've received ${companyName}'s application to become a verified UNIFY credential verifier.</p>`,
    "<p>Our team will review it and let you know as soon as a decision has been made.</p>",
  ].join("\n");
}

function emailText(input: SendVendorApplicationSubmittedEmailInput) {
  return [
    `Hi ${input.contactName},`,
    "",
    `We've received ${input.companyName}'s application to become a verified UNIFY credential verifier.`,
    "Our team will review it and let you know as soon as a decision has been made.",
  ].join("\n");
}

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
    html: emailHtml(input),
    subject: "We've received your UNIFY verifier application",
    text: emailText(input),
    to,
  });
}
