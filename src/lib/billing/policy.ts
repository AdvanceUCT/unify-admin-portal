/**
 * @fileoverview Effective-dated verification billing policy lookup and the audited policy editor.
 * @module lib/billing/policy
 * Deliberately not "server-only": `scripts/bootstrap-billing.ts` runs this
 * outside the Next.js server bundle, matching `src/lib/payments/foundation.ts`'s
 * precedent for CLI-callable modules.
 */

import { Prisma } from "@/generated/prisma/client";
import { BillingPolicySource, AuditAction } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { BillingDomainError } from "@/lib/billing/errors";
import { assertSupportedCurrency } from "@/lib/billing/money";
import { writeAuditLog } from "@/lib/audit/audit";

const MAX_SERIALIZABLE_ATTEMPTS = 3;
// The legacy import policy's effective range starts here so it can never
// overlap a live policy's range, however far back historical data goes.
const LEGACY_POLICY_EPOCH = new Date(0);

function hasPrismaErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

type TransactionRunner = Pick<typeof prisma, "$transaction">;

async function runSerializableTransaction<T>(
  db: TransactionRunner,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 0; attempt < MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!hasPrismaErrorCode(error, "P2034") || attempt === MAX_SERIALIZABLE_ATTEMPTS - 1) {
        throw error;
      }
    }
  }

  throw new Error("The verification billing policy transaction could not be completed.");
}

type PolicyClient = Pick<Prisma.TransactionClient, "verificationBillingPolicy">;

/** Returns the policy whose half-open effective range contains `instant`, if any. */
export async function findVerificationBillingPolicyForInstant(
  client: PolicyClient,
  universityId: string,
  instant: Date,
) {
  return client.verificationBillingPolicy.findFirst({
    where: {
      universityId,
      effectiveFrom: { lte: instant },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: instant } }],
    },
    orderBy: { effectiveFrom: "desc" },
  });
}

/** Returns the currently open (effectiveTo null) policy, i.e. the live rate. */
export async function getOpenVerificationBillingPolicy(client: PolicyClient, universityId: string) {
  return client.verificationBillingPolicy.findFirst({
    where: { universityId, effectiveTo: null },
  });
}

type BootstrapPolicyOptions = {
  universityId: string;
  verificationFeeMinor: bigint;
  legacyFeeMinor: bigint;
  platformBasisPoints: number;
  now?: Date;
};

/**
 * Idempotent: if an open policy already exists for the university, it is
 * returned unchanged (bootstrap never overwrites a configured policy). On a
 * first run this creates a closed legacy-import policy covering all of
 * history up to `now`, and an open live policy starting at `now` — the two
 * ranges are adjacent and therefore never overlap.
 */
export async function bootstrapVerificationBillingPolicies(
  transaction: Prisma.TransactionClient,
  options: BootstrapPolicyOptions,
) {
  assertSupportedCurrency("ZAR");
  const now = options.now ?? new Date();

  const existingOpenPolicy = await getOpenVerificationBillingPolicy(transaction, options.universityId);
  if (existingOpenPolicy) {
    return { created: false, legacyPolicy: null, livePolicy: existingOpenPolicy };
  }

  const legacyPolicy = await transaction.verificationBillingPolicy.create({
    data: {
      universityId: options.universityId,
      version: 1,
      verificationFeeMinor: options.legacyFeeMinor,
      platformBasisPoints: options.platformBasisPoints,
      effectiveFrom: LEGACY_POLICY_EPOCH,
      effectiveTo: now,
      source: BillingPolicySource.LEGACY_IMPORT,
    },
  });

  const livePolicy = await transaction.verificationBillingPolicy.create({
    data: {
      universityId: options.universityId,
      version: 2,
      verificationFeeMinor: options.verificationFeeMinor,
      platformBasisPoints: options.platformBasisPoints,
      effectiveFrom: now,
      effectiveTo: null,
      source: BillingPolicySource.BOOTSTRAP,
    },
  });

  return { created: true, legacyPolicy, livePolicy };
}

type CreateFollowUpPolicyOptions = {
  universityId: string;
  verificationFeeMinor: bigint;
  platformBasisPoints: number;
  actorUserId: string;
  now?: Date;
};

/**
 * The only supported way to change verification pricing after bootstrap:
 * closes the current open policy and opens a new one in the same
 * transaction, so the two ranges are exactly adjacent. Never mutates an
 * already-issued charge or invoice — those keep the policy they were
 * created under. `db` defaults to the shared runtime client; tests may pass
 * a client bound to a disposable database instead.
 */
export async function createFollowUpVerificationBillingPolicy(
  options: CreateFollowUpPolicyOptions,
  db: TransactionRunner = prisma,
) {
  return runSerializableTransaction(db, async (transaction) => {
    const effectiveFrom = options.now ?? new Date();

    // Lock the current open row before reading it so two concurrent editors
    // serialize instead of both reading a policy that is about to close.
    await transaction.$queryRaw`
      SELECT "id" FROM "verification_billing_policy"
      WHERE "universityId" = ${options.universityId} AND "effectiveTo" IS NULL
      FOR UPDATE
    `;

    const currentPolicy = await getOpenVerificationBillingPolicy(transaction, options.universityId);
    if (!currentPolicy) {
      throw new BillingDomainError(
        "POLICY_NOT_FOUND",
        "No open verification billing policy exists to close. Run billing:bootstrap first.",
      );
    }

    await transaction.verificationBillingPolicy.update({
      where: { id: currentPolicy.id },
      data: { effectiveTo: effectiveFrom },
    });

    const newPolicy = await transaction.verificationBillingPolicy.create({
      data: {
        universityId: options.universityId,
        version: currentPolicy.version + 1,
        verificationFeeMinor: options.verificationFeeMinor,
        platformBasisPoints: options.platformBasisPoints,
        effectiveFrom,
        effectiveTo: null,
        source: BillingPolicySource.ADMIN_EDIT,
        actorUserId: options.actorUserId,
      },
    });

    await writeAuditLog(
      {
        action: AuditAction.BILLING_POLICY_CREATED,
        actorId: options.actorUserId,
        targetType: "VerificationBillingPolicy",
        targetId: newPolicy.id,
        meta: {
          universityId: options.universityId,
          version: newPolicy.version,
          platformBasisPoints: options.platformBasisPoints,
        },
      },
      transaction,
    );

    return newPolicy;
  });
}
