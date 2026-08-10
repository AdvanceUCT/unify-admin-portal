/**
 * @fileoverview Builds and sends invitations for vendor staff accounts.
 * @module lib/email/vendor-staff-invites
 */

import "server-only";

import { env } from "@/lib/config/env";
import { escapeHtml, sendResendEmail, type EmailDeliveryResult } from "@/lib/email/resend";

type VendorStaffInviteEmailInput = {
  to: string;
  name: string;
  vendorName: string;
  inviteUrl: string;
  expiresAt: Date;
};

export async function sendVendorStaffInviteEmail(
  input: VendorStaffInviteEmailInput,
): Promise<EmailDeliveryResult> {
  if (process.env.NODE_ENV !== "production") {
    console.info(
      [
        "Vendor staff invite email delivery is using the development logger.",
        `To: ${input.name} <${input.to}>`,
        `Vendor: ${input.vendorName}`,
        `Expires: ${input.expiresAt.toISOString()}`,
        `Invite URL: ${input.inviteUrl}`,
      ].join("\n"),
    );
    return { provider: "console" };
  }
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required to send vendor staff invites.");

  const name = escapeHtml(input.name);
  const vendorName = escapeHtml(input.vendorName);
  const inviteUrl = escapeHtml(input.inviteUrl);
  return sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.AUTH_EMAIL_FROM,
    to: input.to,
    subject: `Join ${input.vendorName} on UNIFY`,
    html: [
      `<p>Hi ${name},</p>`,
      `<p>You have been invited to work at ${vendorName} on the UNIFY Vendor Portal.</p>`,
      `<p><a href="${inviteUrl}">Accept your staff invite</a></p>`,
      `<p>This invite expires at ${input.expiresAt.toLocaleString()}.</p>`,
      `<p>${inviteUrl}</p>`,
    ].join("\n"),
    text: [
      `Hi ${input.name},`,
      "",
      `You have been invited to work at ${input.vendorName} on the UNIFY Vendor Portal.`,
      `Accept your invite: ${input.inviteUrl}`,
      `This invite expires at ${input.expiresAt.toISOString()}.`,
    ].join("\n"),
  });
}
