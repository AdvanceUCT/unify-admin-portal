/**
 * @fileoverview One-time historical import of VerificationCharge rows for VendorVerification
 * rows that predate the charge/invoice system.
 *
 * This is a minimal-scope implementation (see
 * docs/paystack-vendor-invoicing-implementation-status.md, Phase 2): it
 * implements the core dry-run/apply contract, idempotent selection, and a
 * keyset cursor for resumability, but not the handoff's full six-category
 * classification table (missing-branch name recovery, legacy-rate
 * reconstruction heuristics, etc.) — there is no real historical data in
 * this deployment to develop or verify those paths against.
 * Deliberately not "server-only": `scripts/billing-backfill.ts` runs this
 * outside the Next.js server bundle, matching `src/lib/payments/foundation.ts`'s
 * precedent for CLI-callable modules.
 * @module lib/billing/backfill
 */

import type { Prisma } from "@/generated/prisma/client";
import { ChargeSource, VendorVerificationBillingStatus } from "@/generated/prisma/enums";
import { requireSingleUniversityId } from "@/lib/billing/config";
import { recordBillingException } from "@/lib/billing/exceptions";
import { computeVerificationShares } from "@/lib/billing/money";
import { findVerificationBillingPolicyForInstant } from "@/lib/billing/policy";

export type BackfillClient = Pick<
  Prisma.TransactionClient,
  "vendorVerification" | "verificationCharge" | "universityProfile" | "verificationBillingPolicy" | "billingException"
>;

export type RunVerificationBillingBackfillOptions = {
  /** When false (the default), scans and reports but writes nothing. */
  apply?: boolean;
  /** Only considers verifications created at or before this instant. Defaults to now. */
  cutoff?: Date;
  /** Resumes after this verification id (exclusive), ordered by id ascending. */
  cursor?: string | null;
  /** Bounds how many verifications one call scans, for resumable batches. */
  batchSize?: number;
};

export type VerificationBillingBackfillSummary = {
  scanned: number;
  imported: number;
  alreadyImported: number;
  notBillable: number;
  pending: number;
  exceptions: number;
  /** Pass back as `cursor` to continue; null once a batch returns fewer than `batchSize` rows. */
  nextCursor: string | null;
};

const DEFAULT_BATCH_SIZE = 500;

function hasPrismaErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/**
 * Scans one bounded batch of `VendorVerification` rows and, in `--apply`
 * mode, creates the original `VerificationCharge` for each eligible
 * completed-and-billable row that doesn't already have one. Never overwrites
 * a verification's own stored fee/currency snapshot — that would reprice
 * history using today's configuration. Uses the same idempotent
 * create-or-find-existing shape as the live finalizer
 * (`finalizeVerificationCharge`), sourced as `EXISTING_SNAPSHOT` instead of
 * `LIVE`.
 */
export async function runVerificationBillingBackfill(
  client: BackfillClient,
  options: RunVerificationBillingBackfillOptions = {},
): Promise<VerificationBillingBackfillSummary> {
  const apply = options.apply ?? false;
  const cutoff = options.cutoff ?? new Date();
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  const rows = await client.vendorVerification.findMany({
    where: {
      createdAt: { lte: cutoff },
      ...(options.cursor ? { id: { gt: options.cursor } } : {}),
    },
    include: { branch: { select: { name: true } }, charge: true },
    orderBy: { id: "asc" },
    take: batchSize,
  });

  const summary: VerificationBillingBackfillSummary = {
    scanned: rows.length,
    imported: 0,
    alreadyImported: 0,
    notBillable: 0,
    pending: 0,
    exceptions: 0,
    nextCursor: rows.length === batchSize ? rows[rows.length - 1].id : null,
  };

  if (rows.length === 0) {
    return summary;
  }

  const universityId = await requireSingleUniversityId(client);

  for (const verification of rows) {
    if (verification.charge) {
      summary.alreadyImported += 1;
      continue;
    }

    if (verification.billingStatus === VendorVerificationBillingStatus.PENDING) {
      summary.pending += 1;
      continue;
    }

    if (verification.billingStatus !== VendorVerificationBillingStatus.BILLABLE) {
      summary.notBillable += 1;
      continue;
    }

    if (!verification.completedAt || !verification.billingPeriodKey) {
      summary.exceptions += 1;
      if (apply) {
        await recordBillingException(client, {
          type: "BACKFILL_MISSING_SNAPSHOT",
          dedupeKey: `backfill-missing-snapshot:${verification.id}`,
          details: {
            verificationId: verification.id,
            hasCompletedAt: Boolean(verification.completedAt),
            hasBillingPeriodKey: Boolean(verification.billingPeriodKey),
          },
        });
      }
      continue;
    }

    const policy = await findVerificationBillingPolicyForInstant(client, universityId, verification.completedAt);
    if (!policy) {
      summary.exceptions += 1;
      if (apply) {
        await recordBillingException(client, {
          type: "BACKFILL_MISSING_POLICY",
          dedupeKey: `backfill-missing-policy:${verification.id}`,
          details: { verificationId: verification.id, completedAt: verification.completedAt.toISOString() },
        });
      }
      continue;
    }

    summary.imported += 1;
    if (!apply) continue;

    const feeMinor = BigInt(verification.verificationFeeMinor);
    const { platformMinor, universityMinor } = computeVerificationShares(feeMinor, policy.platformBasisPoints);
    const branchNameSnapshot = verification.branch?.name ?? verification.servicePointName ?? "Unattributed branch";

    try {
      await client.verificationCharge.create({
        data: {
          verificationId: verification.id,
          vendorProfileId: verification.vendorProfileId,
          branchId: verification.branchId,
          branchNameSnapshot,
          servicePeriodKey: verification.billingPeriodKey,
          serviceCompletedAt: verification.completedAt,
          feeMinor,
          currency: verification.verificationFeeCurrency,
          platformShareMinor: platformMinor,
          universityShareMinor: universityMinor,
          policyId: policy.id,
          source: ChargeSource.EXISTING_SNAPSHOT,
        },
      });
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2002")) {
        throw error;
      }
      // Already imported by a concurrent run; not a new import.
      summary.imported -= 1;
      summary.alreadyImported += 1;
    }
  }

  return summary;
}
