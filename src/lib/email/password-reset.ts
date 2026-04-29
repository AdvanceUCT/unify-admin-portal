import "server-only";

type SendPasswordResetEmailInput = {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
  expiresInMinutes,
}: SendPasswordResetEmailInput) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Password reset email provider is not configured.");
  }

  console.info(
    [
      "Password reset email delivery is using the development logger.",
      `To: ${name} <${to}>`,
      `Expires in: ${expiresInMinutes} minutes`,
      `Reset URL: ${resetUrl}`,
    ].join("\n"),
  );
}
