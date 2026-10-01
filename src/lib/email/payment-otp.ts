/** Payment OTP delivery keeps existing sender, test override and error behavior. */
import "server-only";
import { env } from "@/lib/config/env";
import { WalletDomainError } from "@/lib/payments/errors";
import { sendResendEmail } from "./resend";
import { renderPaymentOtpEmail } from "./templates";

export async function sendPaymentOtpEmail(input: { to: string; otp: string; studentName: string; challengeId: string }) {
  if (!env.RESEND_API_KEY || !env.PAYMENT_OTP_EMAIL_FROM) throw new WalletDomainError("PAYMENT_WALLET_DISABLED", "Payment OTP email configuration is missing.");
  const recipient = env.PAYMENT_OTP_EMAIL_OVERRIDE_TO ?? input.to;
  if (env.PAYMENT_OTP_EMAIL_OVERRIDE_TO) console.warn("[wallet-activation] Sending payment OTP to configured test override recipient.");
  const delivery = await sendResendEmail({ apiKey: env.RESEND_API_KEY, from: env.PAYMENT_OTP_EMAIL_FROM, to: recipient, ...renderPaymentOtpEmail(input) });
  if (env.PAYMENT_OTP_DEBUG_LOG_CODE) console.warn(`[wallet-activation] Preview OTP debug code for challenge ${input.challengeId}: ${input.otp} (delivery=${delivery.provider}:${delivery.messageId ?? "unknown"})`);
}
