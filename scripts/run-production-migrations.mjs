import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const isProductionVercelBuild =
  process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

if (!isProductionVercelBuild) {
  console.log("Skipping database migrations outside a production Vercel build.");
  process.exit(0);
}

if (!process.env.DIRECT_URL) {
  console.error(
    "DIRECT_URL is required to apply Prisma migrations during a production deployment.",
  );
  process.exit(1);
}

console.log("Applying pending Prisma migrations before production deployment...");

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

process.exit(result.status ?? 1);
