import "server-only";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  escapeHtml,
  sendResendEmail,
} from "@/lib/email/resend";

type SendVendorInviteEmailInput = {
  to: string;
  name: string;
  companyName: string;
  locationName: string;
  inviteUrl: string;
  expiresAt: Date;
};

function emailHtml(input: SendVendorInviteEmailInput) {
  const inviteUrl = escapeHtml(input.inviteUrl);

  return [
    `<p>Hi ${escapeHtml(input.name)},</p>`,
    `<p>You have been invited to join ${escapeHtml(input.companyName)} on the UNIFY Vendor Portal.</p>`,
    `<p>Location: ${escapeHtml(input.locationName)}</p>`,
    `<p><a href="${inviteUrl}">Accept your vendor invite</a></p>`,
    `<p>This invite expires at ${input.expiresAt.toLocaleString()}.</p>`,
    "<p>If the button does not work, copy and open this link:</p>",
    `<p>${inviteUrl}</p>`,
  ].join("\n");
}

function emailText(input: SendVendorInviteEmailInput) {
  return [
    `Hi ${input.name},`,
    "",
    `You have been invited to join ${input.companyName} on the UNIFY Vendor Portal.`,
    `Location: ${input.locationName}`,
    `Accept your vendor invite: ${input.inviteUrl}`,
    `This invite expires at ${input.expiresAt.toISOString()}.`,
  ].join("\n");
}

export async function sendVendorInviteEmail(
  input: SendVendorInviteEmailInput,
): Promise<EmailDeliveryResult> {
  if (process.env.NODE_ENV !== "production") {
    console.info(
      [
        "Vendor invite email delivery is using the development logger.",
        `To: ${input.name} <${input.to}>`,
        `Company: ${input.companyName}`,
        `Location: ${input.locationName}`,
        `Expires: ${input.expiresAt.toISOString()}`,
        `Invite URL: ${input.inviteUrl}`,
      ].join("\n"),
    );
    return { provider: "console" };
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send vendor invite emails.");
  }

  return sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.AUTH_EMAIL_FROM,
    html: emailHtml(input),
    subject: `You have been invited to ${input.companyName}`,
    text: emailText(input),
    to: input.to,
  });
}
