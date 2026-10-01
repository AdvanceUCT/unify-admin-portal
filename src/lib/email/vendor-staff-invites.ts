/**
 * @fileoverview Builds and sends invitations for vendor staff accounts.
 * @module lib/email/vendor-staff-invites
 */

import "server-only";

import { renderVendorStaffInviteEmail } from "./templates";

import { env } from "@/lib/config/env";
import { sendResendEmail, type EmailDeliveryResult } from "@/lib/email/resend";

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

  return sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.AUTH_EMAIL_FROM,
    to: input.to,
    ...renderVendorStaffInviteEmail(input),
  });
}
