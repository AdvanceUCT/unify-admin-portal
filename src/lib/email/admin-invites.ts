import "server-only";

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
}: SendAdminInviteEmailInput) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Admin invite email provider is not configured.");
  }

  console.info(
    [
      "Admin invite email delivery is using the development logger.",
      `To: ${name} <${to}>`,
      `Expires: ${expiresAt.toISOString()}`,
      `Invite URL: ${inviteUrl}`,
    ].join("\n"),
  );
}
