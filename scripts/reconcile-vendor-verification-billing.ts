/**
 * @fileoverview Repairs approved verification rows whose billing snapshot was not materialized.
 * Dry-run by default; pass --apply to update rows and finalize verification charges.
 * @module scripts/reconcile-vendor-verification-billing
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const KNOWN_FLAGS = new Set(["--apply"]);

async function main() {
  for (const argument of process.argv.slice(2)) {
    if (!KNOWN_FLAGS.has(argument)) {
      throw new Error(`Unknown verification billing reconciliation argument: ${argument}`);
    }
  }

  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../src/lib/db/prisma");
  const { reconcileVendorVerificationBilling } = await import("../src/lib/vendors/verifications");

  console.log(
    apply
      ? "Reconciling vendor verification billing in APPLY mode."
      : "Reconciling vendor verification billing in DRY-RUN mode (pass --apply to write).",
  );

  const totals = {
    scanned: 0,
    updated: 0,
    billable: 0,
    stillNotBillable: 0,
  };
  let cursor: string | null = null;
  let batchNumber = 0;

  try {
    for (;;) {
      batchNumber += 1;
      const summary = await reconcileVendorVerificationBilling({ apply, cursor });
      totals.scanned += summary.scanned;
      totals.updated += summary.updated;
      totals.billable += summary.billable;
      totals.stillNotBillable += summary.stillNotBillable;

      console.log(
        `Batch ${batchNumber}: scanned ${summary.scanned}, ${apply ? "updated" : "would update"} ` +
          `${apply ? summary.updated : summary.billable + summary.stillNotBillable}, ` +
          `billable ${summary.billable}, still not billable ${summary.stillNotBillable}.`,
      );

      if (!summary.nextCursor) break;
      cursor = summary.nextCursor;
    }

    console.log("");
    console.log(
      `Totals: scanned ${totals.scanned}, ${apply ? "updated" : "would update"} ` +
        `${apply ? totals.updated : totals.billable + totals.stillNotBillable}, ` +
        `billable ${totals.billable}, still not billable ${totals.stillNotBillable}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
