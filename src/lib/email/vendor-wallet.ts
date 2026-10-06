/**
 * @fileoverview Notifies vendor owners about wallet overdraft, suspension and reinstatement.
 * @module lib/email/vendor-wallet
 */

import "server-only";

import {
  renderVendorOverdraftStartedEmail,
  renderVendorPaymentsRestoredEmail,
  renderVendorPaymentsSuspendedEmail,
} from "./templates";

import { env } from "@/lib/config/env";
import { type EmailDeliveryResult, sendResendEmail } from "@/lib/email/resend";
import { formatMoneyMinor } from "@/lib/formatters";

type VendorWalletContact = { to: string; contactName: string; companyName: string };
type VendorWalletRecipient = VendorWalletContact & { deficitMinor: number };

function topUpUrl() {
  return new URL("/vendor/payments/top-up", env.APP_URL).toString();
}

async function deliver(kind: string, recipient: VendorWalletContact, message: ReturnType<typeof renderVendorOverdraftStartedEmail>): Promise<EmailDeliveryResult> {
  if (process.env.NODE_ENV !== "production") {
    console.info(
      [
        `Vendor wallet ${kind} email delivery is using the development logger.`,
        `To: ${recipient.contactName} <${recipient.to}>`,
        `Company: ${recipient.companyName}`,
        `Subject: ${message.subject}`,
      ].join("\n"),
    );
    return { provider: "console" };
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send vendor wallet emails.");
  }

  return sendResendEmail({ apiKey: env.RESEND_API_KEY, from: env.AUTH_EMAIL_FROM, ...message, to: recipient.to });
}

export function sendVendorOverdraftStartedEmail(input: VendorWalletRecipient & { suspendAt: Date }) {
  return deliver("overdraft started", input, renderVendorOverdraftStartedEmail({
    contactName: input.contactName,
    companyName: input.companyName,
    deficit: formatMoneyMinor(input.deficitMinor),
    suspendAt: input.suspendAt,
    topUpUrl: topUpUrl(),
  }));
}

export function sendVendorPaymentsSuspendedEmail(input: VendorWalletRecipient & { days: number }) {
  return deliver("payments suspended", input, renderVendorPaymentsSuspendedEmail({
    contactName: input.contactName,
    companyName: input.companyName,
    deficit: formatMoneyMinor(input.deficitMinor),
    days: input.days,
    topUpUrl: topUpUrl(),
  }));
}

export function sendVendorPaymentsRestoredEmail(input: VendorWalletContact) {
  return deliver("payments restored", input, renderVendorPaymentsRestoredEmail(input));
}
