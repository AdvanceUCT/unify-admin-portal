/**
 * @fileoverview Read-only Paystack configuration health check.
 * Deliberately not "server-only": `scripts/paystack-check.ts` calls this
 * outside the Next.js server bundle, matching
 * `src/lib/payments/foundation.ts`'s precedent.
 * @module lib/billing/paystackHealth
 */

import { fetchSubaccount } from "@/lib/paymentProviders/paystack/client";
import { resolvePaystackProviderConfig } from "@/lib/paymentProviders/paystack/config";

export type PaystackConfigurationReport = {
  accountRef: string;
  mode: string;
  subaccountCode: string;
  subaccountActive: boolean;
  subaccountCurrencyOk: boolean;
  subaccountDomainOk: boolean;
  integrationIdMatches: boolean;
  /** True only when every individual check above passed. */
  healthy: boolean;
};

/**
 * Reads the configured subaccount under the test secret and checks its
 * active status, ZAR currency, test domain, and integration identity —
 * never returns bank details or the secret key itself.
 */
export async function checkPaystackConfiguration(): Promise<PaystackConfigurationReport> {
  const config = resolvePaystackProviderConfig();
  const subaccount = await fetchSubaccount(config.secretKey, config.baseUrl, config.subaccountCode);

  const subaccountCurrencyOk = subaccount.currency === "ZAR";
  const subaccountDomainOk = subaccount.domain === "test";
  const integrationIdMatches = subaccount.integrationId === config.expectedIntegrationId;

  return {
    accountRef: config.accountRef,
    mode: config.mode,
    subaccountCode: subaccount.subaccountCode,
    subaccountActive: subaccount.active,
    subaccountCurrencyOk,
    subaccountDomainOk,
    integrationIdMatches,
    healthy: subaccount.active && subaccountCurrencyOk && subaccountDomainOk && integrationIdMatches,
  };
}
