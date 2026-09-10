/**
 * @fileoverview Seeds demo verification history for every approved vendor, for backfill/invoicing demos.
 * @module scripts/seed-vendor-verification-history
 */

/*
 * Creates a handful of already-completed, billable VendorVerification rows
 * per approved vendor, spread across recent months, so `billing:backfill`
 * and `billing:invoices` have real historical usage to turn into charges
 * and invoices. Does not touch charges/invoices itself — run those scripts
 * afterward. Run only against an isolated, disposable demo database. For a
 * clean rerun, recreate or restore that database rather than deleting rows.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const DEFAULT_COUNT_PER_VENDOR = 12;
const DEFAULT_MONTHS_BACK = 3;
const KNOWN_FLAGS = ["--count", "--months-back"];

function readIntFlag(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo verification history in production.");
  }

  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (KNOWN_FLAGS.includes(argument)) {
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  const countPerVendor = readIntFlag("--count", DEFAULT_COUNT_PER_VENDOR);
  const monthsBack = readIntFlag("--months-back", DEFAULT_MONTHS_BACK);

  const { prisma } = await import("../src/lib/db/prisma");
  const { seedVerificationHistoryForVendor } = await import("../src/lib/billing/demoSeed");

  try {
    const vendors = await prisma.vendorProfile.findMany({
      where: { applications: { some: { status: "APPROVED" } } },
      select: { id: true, companyName: true },
    });

    if (vendors.length === 0) {
      console.log("No approved vendors found — nothing to seed.");
      return;
    }

    let totalCreated = 0;

    for (const vendor of vendors) {
      const created = await seedVerificationHistoryForVendor(prisma, {
        vendorProfileId: vendor.id,
        count: countPerVendor,
        monthsBack,
      });
      totalCreated += created;
      console.log(`Seeded ${created} verification(s) for ${vendor.companyName}.`);
    }

    console.log(`\nCreated ${totalCreated} demo verification(s) across ${vendors.length} vendor(s), spread over the last ${monthsBack} month(s).`);
    console.log("Next: npx tsx scripts/billing-backfill.ts --apply, then npx tsx scripts/billing-invoices.ts --apply");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
