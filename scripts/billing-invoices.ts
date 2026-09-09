/**
 * @fileoverview Issues eligible vendor invoices for closed billing periods. Dry-run by default.
 * @module scripts/billing-invoices
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const KNOWN_FLAGS = ["--apply", "--as-of"];

function readAsOf(): Date {
  const index = process.argv.indexOf("--as-of");
  if (index === -1) return new Date();

  const value = process.argv[index + 1];
  const parsed = value ? new Date(value) : undefined;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new Error("--as-of requires a valid ISO 8601 timestamp, e.g. --as-of 2026-10-01T00:00:00Z");
  }
  return parsed;
}

async function main() {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!KNOWN_FLAGS.includes(argument)) {
      throw new Error(`Unknown billing invoices argument: ${argument}`);
    }
    if (argument === "--as-of") {
      index += 1; // consume its value too
    }
  }

  const apply = process.argv.includes("--apply");
  const now = readAsOf();
  const isSimulatedTime = process.argv.includes("--as-of");

  const { prisma } = await import("../src/lib/db/prisma");
  const { previewVendorInvoiceGeneration, runVendorInvoiceGeneration } = await import("../src/lib/billing/invoices");

  console.log(apply ? "Running billing invoice generation in APPLY mode." : "Running billing invoice generation in DRY-RUN mode (pass --apply to write).");
  if (isSimulatedTime) {
    console.log(
      `DEMO/TEST ONLY: treating "now" as ${now.toISOString()} instead of the real current time, so a period can be ` +
        "tested as closed before it actually would be. Never use --as-of against a real deployment's live invoices.",
    );
  }

  try {
    if (!apply) {
      const previews = await previewVendorInvoiceGeneration(prisma, { now });
      if (previews.length === 0) {
        console.log("No invoices are currently due.");
        return;
      }
      for (const preview of previews) {
        console.log(
          `Would issue: vendor ${preview.vendorProfileId}, period ${preview.periodKey}, ` +
            `${preview.chargeCount} charge(s), total ${preview.currency} ${(Number(preview.totalMinor) / 100).toFixed(2)} ` +
            `(platform ${(Number(preview.platformShareMinor) / 100).toFixed(2)}, university ${(Number(preview.universityShareMinor) / 100).toFixed(2)}).`,
        );
      }
      return;
    }

    const summary = await runVendorInvoiceGeneration(prisma, { now });
    if (summary.skippedDisabled) {
      console.log("Skipped: VERIFICATION_INVOICING_ENABLED is not \"true\" — no invoices were issued.");
      return;
    }
    console.log(
      `Vendors scanned: ${summary.vendorsScanned}. Invoices issued: ${summary.invoicesIssued} ` +
        `(${summary.zeroTotalInvoices} zero-total / "No payment required").`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
