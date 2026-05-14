import "server-only";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  escapeHtml,
  sendResendEmail,
} from "@/lib/email/resend";

type SendAdminInviteEmailInput = {
  to: string;
  name: string;
  inviteUrl: string;
  expiresAt: Date;
};

function emailHtml(input: SendAdminInviteEmailInput) {
  const inviteUrl = escapeHtml(input.inviteUrl);
  const name = escapeHtml(input.name);

  return [
    `<p>Hi ${name},</p>`,
    "<p>You have been invited to join the UNIFY Admin Portal.</p>",
    `<p><a href="${inviteUrl}">Accept your admin invite</a></p>`,
    `<p>This invite expires at ${input.expiresAt.toLocaleString()}.</p>`,
    "<p>If the button does not work, copy and open this link:</p>",
    `<p>${inviteUrl}</p>`,
  ].join("\n");
}

function emailText(input: SendAdminInviteEmailInput) {
  return [
    `Hi ${input.name},`,
    "",
    "You have been invited to join the UNIFY Admin Portal.",
    `Accept your admin invite: ${input.inviteUrl}`,
    `This invite expires at ${input.expiresAt.toISOString()}.`,
  ].join("\n");
}

export async function sendAdminInviteEmail({
  to,
  name,
  inviteUrl,
  expiresAt,
}: SendAdminInviteEmailInput): Promise<EmailDeliveryResult> {
  const input = { expiresAt, inviteUrl, name, to };

  if (process.env.NODE_ENV !== "production") {
    console.info(
      [
        "Admin invite email delivery is using the development logger.",
        `To: ${name} <${to}>`,
        `Expires: ${expiresAt.toISOString()}`,
        `Invite URL: ${inviteUrl}`,
      ].join("\n"),
    );
    return { provider: "console" };
  }

  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required to send admin invite emails.");
  }

  return sendResendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.AUTH_EMAIL_FROM,
    html: emailHtml(input),
    subject: "You have been invited to UNIFY Admin Portal",
    text: emailText(input),
    to,
  });
}
