/**
 * @fileoverview Idempotently creates the original VerificationCharge for a terminal, billable verification.
 * @module lib/billing/charges
 * Deliberately not "server-only": CLI scripts (e.g. `scripts/billing-backfill.ts`)
 * may need to call this outside the Next.js server bundle, matching
 * `src/lib/payments/foundation.ts`'s precedent.
 */

import type { Prisma } from "@/generated/prisma/client";
import { ChargeSource, VendorVerificationBillingStatus } from "@/generated/prisma/enums";
import { requireSingleUniversityId } from "@/lib/billing/config";
import { recordBillingException } from "@/lib/billing/exceptions";
import { computeVerificationShares } from "@/lib/billing/money";
import { findVerificationBillingPolicyForInstant } from "@/lib/billing/policy";

export type ChargeClient = Pick<
  Prisma.TransactionClient,
  "verificationCharge" | "universityProfile" | "verificationBillingPolicy" | "billingException"
>;

export type FinalizeVerificationChargeInput = {
  verificationId: string;
  vendorProfileId: string;
  branchId: string | null;
  branchNameSnapshot: string;
  billingStatus: VendorVerificationBillingStatus;
  verificationFeeMinor: number;
  verificationFeeCurrency: string;
  billingPeriodKey: string | null;
  completedAt: Date | null;
};

function hasPrismaErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/**
 * Called after every terminal verification write (polling, webhook delivery,
 * and already-terminal checkout creation) so all three paths produce the
 * same financial result. Never throws — a billing failure must not break
 * verification processing itself; unresolved problems become a
 * `BillingException` instead. Charges are immutable once created, so a later
 * contradiction (billability or price evidence changes) is recorded as a
 * correction exception rather than rewriting the original charge.
 */
export async function finalizeVerificationCharge(
  client: ChargeClient,
  input: FinalizeVerificationChargeInput,
) {
  try {
    const existing = await client.verificationCharge.findUnique({
      where: { verificationId: input.verificationId },
    });

    if (existing) {
      const isNowBillable = input.billingStatus === VendorVerificationBillingStatus.BILLABLE;
      const contradicts =
        !isNowBillable ||
        BigInt(input.verificationFeeMinor) !== existing.feeMinor ||
        input.verificationFeeCurrency !== existing.currency;

      if (contradicts) {
        await recordBillingException(client, {
          type: "CHARGE_BILLABILITY_CORRECTION",
          dedupeKey: `charge-correction:${input.verificationId}`,
          chargeId: existing.id,
          details: {
            verificationId: input.verificationId,
            chargedFeeMinor: existing.feeMinor.toString(),
            chargedCurrency: existing.currency,
            currentBillingStatus: input.billingStatus,
            currentFeeMinor: input.verificationFeeMinor,
            currentFeeCurrency: input.verificationFeeCurrency,
          },
        });
      }

      return existing;
    }

    if (input.billingStatus !== VendorVerificationBillingStatus.BILLABLE) {
      return null;
    }
    if (!input.completedAt || !input.billingPeriodKey) {
      return null;
    }

    const universityId = await requireSingleUniversityId(client);
    const policy = await findVerificationBillingPolicyForInstant(client, universityId, input.completedAt);
    if (!policy) {
      await recordBillingException(client, {
        type: "MISSING_BILLING_POLICY",
        dedupeKey: `missing-policy:${input.verificationId}`,
        details: {
          verificationId: input.verificationId,
          completedAt: input.completedAt.toISOString(),
        },
      });
      return null;
    }

    const feeMinor = BigInt(input.verificationFeeMinor);
    const { platformMinor, universityMinor } = computeVerificationShares(feeMinor, policy.platformBasisPoints);

    try {
      return await client.verificationCharge.create({
        data: {
          verificationId: input.verificationId,
          vendorProfileId: input.vendorProfileId,
          branchId: input.branchId,
          branchNameSnapshot: input.branchNameSnapshot,
          servicePeriodKey: input.billingPeriodKey,
          serviceCompletedAt: input.completedAt,
          feeMinor,
          currency: input.verificationFeeCurrency,
          platformShareMinor: platformMinor,
          universityShareMinor: universityMinor,
          policyId: policy.id,
          source: ChargeSource.LIVE,
        },
      });
    } catch (error) {
      if (hasPrismaErrorCode(error, "P2002")) {
        // A concurrent finalization call (e.g. a poll racing a webhook) won
        // the insert first — the unique verificationId constraint is the
        // concurrency guard, not this function's own control flow.
        return client.verificationCharge.findUnique({ where: { verificationId: input.verificationId } });
      }
      throw error;
    }
  } catch (error) {
    console.error("Failed to finalize verification charge", input.verificationId, error);
    await recordBillingException(client, {
      type: "CHARGE_FINALIZATION_FAILED",
      dedupeKey: `finalize-failed:${input.verificationId}`,
      details: {
        verificationId: input.verificationId,
        message: error instanceof Error ? error.message : String(error),
      },
    });
    return null;
  }
}
