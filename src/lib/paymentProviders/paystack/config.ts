/**
 * @fileoverview Resolves the Paystack provider account configuration from environment.
 * Deliberately not "server-only": `scripts/paystack-check.ts` calls this
 * outside the Next.js server bundle, matching
 * `src/lib/payments/foundation.ts`'s precedent.
 * @module lib/paymentProviders/paystack/config
 */

import { env } from "@/lib/config/env";
import { PaystackProviderError } from "@/lib/paymentProviders/paystack/errors";

export const PAYSTACK_API_BASE_URL = "https://api.paystack.co";

export type PaystackProviderConfig = {
  secretKey: string;
  mode: string;
  accountRef: string;
  subaccountCode: string;
  expectedIntegrationId: string;
  baseUrl: string;
};

/**
 * Throws if the Paystack identity variables required for checkout aren't
 * configured — `env.ts` only requires them when
 * `VERIFICATION_INVOICE_CHECKOUT_ENABLED` is true, so any caller reaching
 * into the live provider must re-check here.
 */
export function resolvePaystackProviderConfig(): PaystackProviderConfig {
  if (!env.PAYSTACK_SECRET_KEY || !env.PAYSTACK_PLATFORM_SUBACCOUNT_CODE || !env.PAYSTACK_EXPECTED_INTEGRATION_ID) {
    throw new PaystackProviderError(
      "NOT_CONFIGURED",
      "Paystack is not configured: PAYSTACK_SECRET_KEY, PAYSTACK_PLATFORM_SUBACCOUNT_CODE, and PAYSTACK_EXPECTED_INTEGRATION_ID are all required.",
    );
  }

  return {
    secretKey: env.PAYSTACK_SECRET_KEY,
    mode: env.PAYSTACK_MODE,
    accountRef: env.PAYSTACK_ACCOUNT_REF,
    subaccountCode: env.PAYSTACK_PLATFORM_SUBACCOUNT_CODE,
    expectedIntegrationId: env.PAYSTACK_EXPECTED_INTEGRATION_ID,
    baseUrl: PAYSTACK_API_BASE_URL,
  };
}
