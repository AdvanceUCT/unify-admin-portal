/**
 * @fileoverview One-time historical import of VerificationCharge rows for VendorVerification
 * rows that predate the charge/invoice system.
 *
 * Pre-migration terminal rows have no trustworthy price snapshot. They are
 * classified from their authoritative result and completion time, then use
 * the explicitly bootstrapped legacy policy rather than today's live price.
 * Dry runs report the same categories without changing those rows.
 * Deliberately not "server-only": `scripts/billing-backfill.ts` runs this
 * outside the Next.js server bundle, matching `src/lib/payments/foundation.ts`'s
 * precedent for CLI-callable modules.
 * @module lib/billing/backfill
 */

import type { Prisma } from "@/generated/prisma/client";
import {
  ChargeSource,
  VendorVerificationBillingStatus,
} from "@/generated/prisma/enums";
import { requireSingleUniversityId } from "@/lib/billing/config";
import { recordBillingException } from "@/lib/billing/exceptions";
import { computeVerificationShares } from "@/lib/billing/money";
import { findVerificationBillingPolicyForInstant } from "@/lib/billing/policy";

export type BackfillClient = Pick<
  Prisma.TransactionClient,
  | "vendorVerification"
  | "verificationCharge"
  | "universityProfile"
  | "verificationBillingPolicy"
  | "billingException"
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
  /** When set, scans only this vendor's verifications — e.g. a vendor-scoped self-service tool. Omit for the global CLI/cron import. */
  vendorProfileId?: string;
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
const JOHANNESBURG_OFFSET_MS = 2 * 60 * 60 * 1000;

function legacyBillingPeriodKey(date: Date) {
  const reportingDate = new Date(date.getTime() + JOHANNESBURG_OFFSET_MS);
  return `${reportingDate.getUTCFullYear()}-${String(reportingDate.getUTCMonth() + 1).padStart(2, "0")}`;
}

function hasPrismaErrorCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
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
      ...(options.vendorProfileId ? { vendorProfileId: options.vendorProfileId } : {}),
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

    if (
      verification.billingStatus === VendorVerificationBillingStatus.PENDING &&
      verification.status === "PENDING"
    ) {
      summary.pending += 1;
      continue;
    }

    if (
      verification.billingStatus === VendorVerificationBillingStatus.PENDING &&
      !verification.completedAt
    ) {
      summary.exceptions += 1;
      if (apply) {
        await recordBillingException(client, {
          type: "BACKFILL_MISSING_SNAPSHOT",
          dedupeKey: `backfill-missing-snapshot:${verification.id}`,
          details: {
            verificationId: verification.id,
            status: verification.status,
            hasCompletedAt: false,
            hasBillingPeriodKey: false,
          },
        });
      }
      continue;
    }

    if (
      verification.billingStatus === VendorVerificationBillingStatus.PENDING &&
      (verification.status !== "APPROVED" || verification.isVerified === false)
    ) {
      summary.notBillable += 1;
      if (apply) {
        await client.vendorVerification.update({
          where: { id: verification.id },
          data: {
            billingStatus: VendorVerificationBillingStatus.NOT_BILLABLE,
            verificationFeeMinor: 0,
            billingPeriodKey: legacyBillingPeriodKey(verification.completedAt!),
            pricingSnapshotAt: new Date(),
            billingReason:
              verification.status === "APPROVED" &&
              verification.isVerified === false
                ? "NOT_VERIFIED"
                : verification.status,
          },
        });
      }
      continue;
    }

    if (
      verification.billingStatus !== VendorVerificationBillingStatus.BILLABLE &&
      verification.billingStatus !== VendorVerificationBillingStatus.PENDING
    ) {
      summary.notBillable += 1;
      continue;
    }

    const isLegacySnapshot =
      verification.billingStatus === VendorVerificationBillingStatus.PENDING;

    if (
      !verification.completedAt ||
      (!isLegacySnapshot && !verification.billingPeriodKey)
    ) {
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

    const policy = await findVerificationBillingPolicyForInstant(
      client,
      universityId,
      verification.completedAt,
    );
    if (!policy) {
      summary.exceptions += 1;
      if (apply) {
        await recordBillingException(client, {
          type: "BACKFILL_MISSING_POLICY",
          dedupeKey: `backfill-missing-policy:${verification.id}`,
          details: {
            verificationId: verification.id,
            completedAt: verification.completedAt.toISOString(),
          },
        });
      }
      continue;
    }

    const feeMinor = isLegacySnapshot
      ? BigInt(policy.verificationFeeMinor)
      : BigInt(verification.verificationFeeMinor);
    const currency = isLegacySnapshot
      ? policy.currency
      : verification.verificationFeeCurrency;
    const servicePeriodKey = isLegacySnapshot
      ? legacyBillingPeriodKey(verification.completedAt)
      : verification.billingPeriodKey!;
    const source = isLegacySnapshot
      ? ChargeSource.LEGACY_DEMO_BACKFILL
      : ChargeSource.EXISTING_SNAPSHOT;
    const { platformMinor, universityMinor } = computeVerificationShares(
      feeMinor,
      policy.platformBasisPoints,
    );
    const branchNameSnapshot =
      verification.branch?.name ??
      verification.servicePointName ??
      "Unattributed branch";

    summary.imported += 1;
    if (!apply) continue;

    try {
      if (isLegacySnapshot) {
        const feeMinorNumber = Number(feeMinor);
        if (
          !Number.isSafeInteger(feeMinorNumber) ||
          feeMinorNumber > 2_147_483_647
        ) {
          throw new Error(
            "The legacy verification fee does not fit the verification snapshot column.",
          );
        }

        await client.vendorVerification.update({
          where: { id: verification.id },
          data: {
            billingStatus: VendorVerificationBillingStatus.BILLABLE,
            verificationFeeMinor: feeMinorNumber,
            verificationFeeCurrency: currency,
            billingPeriodKey: servicePeriodKey,
            pricingSnapshotAt: new Date(),
            billingReason: "LEGACY_APPROVED_VERIFICATION",
          },
        });
      }

      await client.verificationCharge.create({
        data: {
          verificationId: verification.id,
          vendorProfileId: verification.vendorProfileId,
          branchId: verification.branchId,
          branchNameSnapshot,
          servicePeriodKey,
          serviceCompletedAt: verification.completedAt,
          feeMinor,
          currency,
          platformShareMinor: platformMinor,
          universityShareMinor: universityMinor,
          policyId: policy.id,
          source,
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
