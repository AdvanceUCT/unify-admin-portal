/**
 * @fileoverview Verifies the `x-paystack-signature` header on inbound webhook requests.
 * @module lib/paymentProviders/paystack/signature
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Paystack's documented webhook payload ceiling; reject anything larger before parsing. */
export const MAX_PAYSTACK_WEBHOOK_BODY_BYTES = 256 * 1024;

/**
 * Paystack signs the raw request body with HMAC-SHA512 keyed by the
 * account's secret key and sends the hex digest verbatim (unlike the
 * `sha256=`-prefixed scheme used by `/api/webhooks/agent`).
 */
function signatureFor(rawBody: string, secretKey: string) {
  return createHmac("sha512", secretKey).update(rawBody).digest("hex");
}

/** Constant-time comparison so a partial match can't leak timing information. */
function signaturesMatch(actual: string | null, expected: string) {
  if (!actual) return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function isPaystackWebhookBodyWithinLimit(rawBody: string) {
  return Buffer.byteLength(rawBody, "utf8") <= MAX_PAYSTACK_WEBHOOK_BODY_BYTES;
}

export function verifyPaystackWebhookSignature(rawBody: string, signatureHeader: string | null, secretKey: string) {
  if (!isPaystackWebhookBodyWithinLimit(rawBody)) return false;
  return signaturesMatch(signatureHeader, signatureFor(rawBody, secretKey));
}
