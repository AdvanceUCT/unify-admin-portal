/**
 * @fileoverview Authenticated, read-only Paystack configuration health check.
 * Never prints the secret key or bank/subaccount financial details.
 * @module scripts/paystack-check
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { checkPaystackConfiguration } = await import("../src/lib/billing/paystackHealth");
  const { PaystackProviderError } = await import("../src/lib/paymentProviders/paystack/errors");

  try {
    const report = await checkPaystackConfiguration();

    console.log(`Provider account ref : ${report.accountRef}`);
    console.log(`Mode                 : ${report.mode}`);
    console.log(`Subaccount code      : ${report.subaccountCode}`);
    console.log(`Subaccount active    : ${report.subaccountActive}`);
    console.log(`Currency is ZAR      : ${report.subaccountCurrencyOk}`);
    console.log(`Test domain          : ${report.subaccountDomainOk}`);
    console.log(`Integration ID match : ${report.integrationIdMatches}`);
    console.log("");
    console.log(report.healthy ? "Configuration is healthy." : "Configuration has unresolved problems — see above.");

    if (!report.healthy) process.exitCode = 1;
  } catch (error) {
    if (error instanceof PaystackProviderError) {
      console.error(`Paystack configuration check failed [${error.code}]: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
