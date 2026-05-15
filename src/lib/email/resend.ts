import "server-only";

export type EmailDeliveryResult = {
  messageId?: string;
  provider: "console" | "resend";
};

type SendResendEmailInput = {
  apiKey: string;
  from: string;
  html: string;
  subject: string;
  text: string;
  to: string;
};

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendResendEmail({
  apiKey,
  from,
  html,
  subject,
  text,
  to,
}: SendResendEmailInput): Promise<EmailDeliveryResult> {
  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from,
      html,
      subject,
      text,
      to,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;

  if (!response.ok) {
    throw new Error(body?.message ?? `Resend request failed with status ${response.status}.`);
  }

  return { messageId: body?.id, provider: "resend" };
}
