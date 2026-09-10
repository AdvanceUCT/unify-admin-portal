/**
 * @fileoverview Runs pending Prisma migrations during production builds and fails closed when the direct URL is missing.
 * @module scripts/run-production-migrations
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const isProductionVercelBuild =
  process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";
const isPreviewVercelBuild =
  process.env.VERCEL === "1" && process.env.VERCEL_ENV === "preview";
const runPreviewMigrations =
  isPreviewVercelBuild && process.env.RUN_PRISMA_MIGRATIONS_ON_PREVIEW === "true";

if (!isProductionVercelBuild && !runPreviewMigrations) {
  console.log("Skipping database migrations outside an enabled Vercel build.");
  process.exit(0);
}

if (!process.env.DIRECT_URL) {
  console.error(
    "DIRECT_URL is required to apply Prisma migrations during a production deployment.",
  );
  process.exit(1);
}

console.log("Applying pending Prisma migrations before Vercel deployment...");

const require = createRequire(import.meta.url);
const prismaCliPath = require.resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCliPath, "migrate", "deploy"], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error("Unable to start Prisma migrate deploy:", result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (runPreviewMigrations && process.env.PAYMENT_WALLET_BOOTSTRAP_ON_PREVIEW === "true") {
  console.log("Generating Prisma client before preview payment wallet bootstrap...");
  const generateResult = spawnSync(process.execPath, [prismaCliPath, "generate"], {
    env: process.env,
    stdio: "inherit",
  });

  if (generateResult.error) {
    console.error("Unable to start Prisma generate:", generateResult.error.message);
    process.exit(1);
  }

  if (generateResult.status !== 0) {
    process.exit(generateResult.status ?? 1);
  }

  console.log("Bootstrapping payment wallet foundation for preview deployment...");
  const bootstrapResult = spawnSync(process.execPath, [
    "node_modules/tsx/dist/cli.mjs",
    "scripts/bootstrap-payment-wallet.ts",
    "--enable-payment-wallet",
  ], {
    env: process.env,
    stdio: "inherit",
  });

  if (bootstrapResult.error) {
    console.error("Unable to start payment wallet bootstrap:", bootstrapResult.error.message);
    process.exit(1);
  }

  process.exit(bootstrapResult.status ?? 1);
}

process.exit(0);
