/**
 * @fileoverview Notifies a vendor that an invoice is available for payment.
 * @module lib/email/vendor-invoice-notification
 */

import "server-only";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  escapeHtml,
  sendResendEmail,
} from "@/lib/email/resend";

type SendVendorInvoiceNotificationEmailInput = {
  to: string;
  contactName: string;
  companyName: string;
  periodLabel: string;
  amountZar: string;
  dueDateLabel: string;
  portalUrl: string;
};

function emailHtml(input: SendVendorInvoiceNotificationEmailInput) {
  const contactName = escapeHtml(input.contactName);
  const companyName = escapeHtml(input.companyName);
  const periodLabel = escapeHtml(input.periodLabel);
  const amountZar = escapeHtml(input.amountZar);
  const dueDateLabel = escapeHtml(input.dueDateLabel);
  const portalUrl = escapeHtml(input.portalUrl);

  return [
    `<p>Hi ${contactName},</p>`,
    `<p>A verification invoice for ${companyName} is ready for the period ${periodLabel}.</p>`,
    `<p><strong>Amount due:</strong> ${amountZar}<br />`,
    `<strong>Due date:</strong> ${dueDateLabel}</p>`,
    `<p><a href="${portalUrl}">View and pay this invoice</a></p>`,
  ].join("\n");
}

function emailText(input: SendVendorInvoiceNotificationEmailInput) {
  return [
    `Hi ${input.contactName},`,
    "",
    `A verification invoice for ${input.companyName} is ready for the period ${input.periodLabel}.`,
    `Amount due: ${input.amountZar}`,
    `Due date: ${input.dueDateLabel}`,
    `View and pay this invoice: ${input.portalUrl}`,
  ].join("\n");
}

export async function sendVendorInvoiceNotificationEmail({
  to,
  contactName,
  companyName,
  periodLabel,
  amountZar,
  dueDateLabel,
  portalUrl,
}: SendVendorInvoiceNotificationEmailInput): Promise<EmailDeliveryResult> {
  const input = { amountZar, companyName, contactName, dueDateLabel, periodLabel, portalUrl, to };

  if (process.env.NODE_ENV !== "production") {
    console.info(
      [
        "Vendor invoice notification email delivery is using the development logger.",
        `To: ${contactName} <${to}>`,
        `Company: ${companyName}`,
        `Period: ${periodLabel}`,
        `Amount: ${amountZar}`,
        `Due: ${dueDateLabel}`,
        `Portal URL: ${portalUrl}`,
      ].join("\n"),
    );
    return { provider: "console" };
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send vendor invoice notification emails.");
  }

  return sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.AUTH_EMAIL_FROM,
    html: emailHtml(input),
    subject: `Invoice ready — ${periodLabel}`,
    text: emailText(input),
    to,
  });
}
