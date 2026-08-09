import "server-only";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  escapeHtml,
  sendResendEmail,
} from "@/lib/email/resend";

type SendVendorApplicationRevokedEmailInput = {
  to: string;
  contactName: string;
  companyName: string;
  reason: string;
};

function emailHtml(input: SendVendorApplicationRevokedEmailInput) {
  const contactName = escapeHtml(input.contactName);
  const companyName = escapeHtml(input.companyName);
  const reason = escapeHtml(input.reason);

  return [
    `<p>Hi ${contactName},</p>`,
    `<p>${companyName}'s verifier access to UNIFY has been revoked.</p>`,
    `<p><strong>Reason:</strong> ${reason}</p>`,
    "<p>If you believe this is a mistake, please contact the UNIFY team.</p>",
  ].join("\n");
}

function emailText(input: SendVendorApplicationRevokedEmailInput) {
  return [
    `Hi ${input.contactName},`,
    "",
    `${input.companyName}'s verifier access to UNIFY has been revoked.`,
    `Reason: ${input.reason}`,
    "If you believe this is a mistake, please contact the UNIFY team.",
  ].join("\n");
}

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
    html: emailHtml(input),
    subject: "Your UNIFY verifier access has been revoked",
    text: emailText(input),
    to,
  });
}
