/**
 * @fileoverview Historical import of VerificationCharge rows. Dry-run by default; pass --apply to write.
 * @module scripts/billing-backfill
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const KNOWN_FLAGS = ["--apply"];

async function main() {
  for (const argument of process.argv.slice(2)) {
    if (!KNOWN_FLAGS.includes(argument)) {
      throw new Error(`Unknown billing backfill argument: ${argument}`);
    }
  }
  const apply = process.argv.includes("--apply");

  const { prisma } = await import("../src/lib/db/prisma");
  const { runVerificationBillingBackfill } = await import("../src/lib/billing/backfill");

  console.log(apply ? "Running billing backfill in APPLY mode." : "Running billing backfill in DRY-RUN mode (pass --apply to write).");

  const totals = {
    scanned: 0,
    imported: 0,
    alreadyImported: 0,
    notBillable: 0,
    pending: 0,
    exceptions: 0,
  };
  let cursor: string | null = null;
  let batchNumber = 0;
  const startedAt = new Date();

  try {
    for (;;) {
      batchNumber += 1;
      const summary = await runVerificationBillingBackfill(prisma, { apply, cursor });

      totals.scanned += summary.scanned;
      totals.imported += summary.imported;
      totals.alreadyImported += summary.alreadyImported;
      totals.notBillable += summary.notBillable;
      totals.pending += summary.pending;
      totals.exceptions += summary.exceptions;

      console.log(
        `Batch ${batchNumber}: scanned ${summary.scanned}, imported ${summary.imported}, ` +
          `already imported ${summary.alreadyImported}, not billable ${summary.notBillable}, ` +
          `pending ${summary.pending}, exceptions ${summary.exceptions}.`,
      );

      if (!summary.nextCursor) break;
      cursor = summary.nextCursor;
    }

    const reconciled =
      totals.scanned ===
      totals.imported + totals.alreadyImported + totals.notBillable + totals.pending + totals.exceptions;

    console.log("");
    console.log(
      `Totals: scanned ${totals.scanned}, imported ${totals.imported}, already imported ${totals.alreadyImported}, ` +
        `not billable ${totals.notBillable}, pending ${totals.pending}, exceptions ${totals.exceptions}.`,
    );
    if (!reconciled) {
      throw new Error("Backfill totals do not reconcile — scanned must equal the sum of every category.");
    }
    if (totals.exceptions > 0) {
      console.log(
        `${totals.exceptions} verification(s) could not be classified and were recorded as billing exceptions${apply ? "" : " (would be, in --apply mode)"}. Review the billing_exception table before treating history as fully imported.`,
      );
    }

    if (apply) {
      await prisma.billingRun.create({
        data: {
          jobType: "VERIFICATION_CHARGE_BACKFILL",
          status: "COMPLETED",
          scannedCount: totals.scanned,
          importedCount: totals.imported,
          exceptionCount: totals.exceptions,
          startedAt,
          completedAt: new Date(),
          totalsSnapshot: totals,
        },
      });
    }
  } catch (error) {
    if (apply) {
      await prisma.billingRun
        .create({
          data: {
            jobType: "VERIFICATION_CHARGE_BACKFILL",
            status: "FAILED",
            scannedCount: totals.scanned,
            importedCount: totals.imported,
            exceptionCount: totals.exceptions,
            startedAt,
            completedAt: new Date(),
            totalsSnapshot: totals,
            failureReason: error instanceof Error ? error.message : String(error),
          },
        })
        .catch(() => {});
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
