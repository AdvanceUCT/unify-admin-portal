/**
 * @fileoverview Peppered HMAC for payment lookup keys (OTP challenges, request IPs).
 * @module lib/payments/hashing
 */

import "server-only";

import { createHmac } from "node:crypto";

import { env } from "@/lib/config/env";
import { WalletDomainError } from "@/lib/payments/errors";

/** Fails closed when the pepper is missing, which only the dev OTP bypass allows. */
export function paymentHmac(value: string) {
  const pepper = env.PAYMENT_OTP_PEPPER;
  if (!pepper) throw new WalletDomainError("PAYMENT_WALLET_DISABLED", "Payment OTP configuration is missing.");
  return createHmac("sha256", pepper).update(value, "utf8").digest("hex");
}
