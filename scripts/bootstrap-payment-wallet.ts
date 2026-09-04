/**
 * @fileoverview Idempotently prepares the database for payment-wallet development.
 * @module scripts/bootstrap-payment-wallet
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const ENABLE_PAYMENTS_FLAG = "--enable-payments";

function hasPrismaErrorCode(error: unknown, codes: string[]) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    codes.includes(error.code)
  );
}

async function main() {
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== ENABLE_PAYMENTS_FLAG);
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown payment bootstrap argument: ${unknownArguments.join(", ")}`);
  }

  const enablePaymentsForDevelopment = process.argv.includes(ENABLE_PAYMENTS_FLAG);
  if (enablePaymentsForDevelopment && process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to enable payments from the bootstrap command in production. Use the future controlled activation workflow.",
    );
  }

  const { prisma } = await import("../src/lib/db/prisma");
  const { bootstrapPaymentWalletFoundation } = await import(
    "../src/lib/payments/foundation"
  );

  try {
    const result = await prisma.$transaction(
      (transaction) =>
        bootstrapPaymentWalletFoundation(transaction, {
          enablePaymentsForDevelopment,
        }),
      { isolationLevel: "Serializable" },
    );

    console.log(
      `Payment wallet foundation ready for ${result.university.name} (${result.university.abbreviation}).`,
    );
    console.log(
      `Payments enabled: ${result.university.paymentsEnabled ? "yes" : "no"}`,
    );

    for (const account of result.systemAccounts) {
      console.log(
        `${account.systemCode}: ${account.id} (balance ${account.balance!.postedBalanceMinor.toString()} ${account.currency} cents)`,
      );
    }

    if (!result.university.paymentsEnabled) {
      console.log(
        "Payments remain disabled. Use npm run payments:bootstrap:dev only in a development environment when posting tests need to run.",
      );
    }
  } catch (error) {
    if (hasPrismaErrorCode(error, ["P2021", "P2022"])) {
      throw new Error(
        "The payment wallet schema is not available. Apply committed migrations with `npx prisma migrate deploy`, then rerun this command.",
        { cause: error },
      );
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
