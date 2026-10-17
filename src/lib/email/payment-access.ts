import "server-only";
import { renderEmail } from "./layout";

export function renderPaymentAccessDecisionEmail(input: { companyName: string; branchName: string; approved: boolean; requestUrl: string }) {
  return renderEmail({ subject: input.approved ? "Your branch payment access is approved" : "An update on your payment-access request",
    preview: `Payment-access update for ${input.branchName}.`, category: "PAYMENT ACCESS", heading: input.approved ? "Branch approved" : "Review your request",
    footer: "UNIFY Vendor Portal · Payment access", blocks: [
      { kind: "paragraph", text: `${input.companyName}: ${input.branchName}'s payment-access request ${input.approved ? "has been approved. Open the portal to check payment readiness and continue setup." : "was not approved. Open the portal to review the feedback and update your request."}` },
      { kind: "action", label: "View payment access", url: input.requestUrl },
    ] });
}
export async function sendPaymentAccessDecisionEmail(input: { companyName: string; branchName: string; branchId: string; to: string; approved: boolean }) {
  const { env } = await import("@/lib/config/env");
  const message = renderPaymentAccessDecisionEmail({ ...input, requestUrl: new URL(`/vendor/branches/${encodeURIComponent(input.branchId)}/payment-access`, env.APP_URL).toString() });
  if (process.env.NODE_ENV !== "production") return { provider: "console" as const };
  if (!env.RESEND_API_KEY) throw new Error("Email delivery is unavailable.");
  const { sendResendEmail } = await import("./resend");
  return sendResendEmail({ apiKey: env.RESEND_API_KEY, from: env.AUTH_EMAIL_FROM, to: input.to, ...message });
}
