import "server-only";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  escapeHtml,
  sendResendEmail,
} from "@/lib/email/resend";

type SendVendorApplicationApprovedEmailInput = {
  to: string;
  contactName: string;
  companyName: string;
  portalUrl: string;
};

function emailHtml(input: SendVendorApplicationApprovedEmailInput) {
  const contactName = escapeHtml(input.contactName);
  const companyName = escapeHtml(input.companyName);
  const portalUrl = escapeHtml(input.portalUrl);

  return [
    `<p>Hi ${contactName},</p>`,
    `<p>Congratulations! ${companyName}'s application has been approved. You're now a verified UNIFY credential verifier.</p>`,
    `<p><a href="${portalUrl}">Go to your vendor portal</a></p>`,
  ].join("\n");
}

function emailText(input: SendVendorApplicationApprovedEmailInput) {
  return [
    `Hi ${input.contactName},`,
    "",
    `Congratulations! ${input.companyName}'s application has been approved. You're now a verified UNIFY credential verifier.`,
    `Go to your vendor portal: ${input.portalUrl}`,
  ].join("\n");
}

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
    html: emailHtml(input),
    subject: "Your UNIFY verifier application has been approved",
    text: emailText(input),
    to,
  });
}
