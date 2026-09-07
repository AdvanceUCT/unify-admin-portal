/**
 * @fileoverview Validates Paystack secret keys with a harmless read-only call.
 * @module lib/payments/paystackClient
 */

import "server-only";

const PAYSTACK_API_BASE_URL = "https://api.paystack.co";
const VALIDATION_TIMEOUT_MS = 10_000;

export class PaystackKeyError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "PaystackKeyError";
    this.status = status;
  }
}

export type PaystackKeyMode = "TEST" | "LIVE";

/**
 * Classifies a Paystack secret key by its `sk_test_`/`sk_live_` prefix without
 * making a network call, so obviously malformed input is rejected immediately.
 */
export function classifyPaystackSecretKey(key: string): PaystackKeyMode {
  if (key.startsWith("sk_test_")) return "TEST";
  if (key.startsWith("sk_live_")) return "LIVE";
  throw new PaystackKeyError("Paystack secret keys must start with sk_test_ or sk_live_.");
}

/**
 * Confirms a Paystack secret key actually works by fetching the merchant
 * balance — a harmless, side-effect-free read — before the key is stored.
 */
export async function validatePaystackSecretKey(key: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${PAYSTACK_API_BASE_URL}/balance`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
  } catch (error) {
    throw new PaystackKeyError(
      error instanceof Error && error.name === "AbortError"
        ? "Paystack did not respond in time. Please try again."
        : "Could not reach Paystack to validate this key.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new PaystackKeyError("Paystack rejected this key as invalid.", response.status);
    }
    throw new PaystackKeyError(
      `Paystack validation failed with status ${response.status}.`,
      response.status,
    );
  }
}
