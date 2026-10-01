/**
 * @fileoverview Builds and sends administrator invitation emails.
 * @module lib/email/admin-invites
 */

import "server-only";

import { renderAdminInviteEmail } from "./templates";

import { env } from "@/lib/config/env";
import {
  type EmailDeliveryResult,
  sendResendEmail,
} from "@/lib/email/resend";

type SendAdminInviteEmailInput = {
  to: string;
  name: string;
  inviteUrl: string;
  expiresAt: Date;
};

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
    ...renderAdminInviteEmail(input),
    to,
  });
}
