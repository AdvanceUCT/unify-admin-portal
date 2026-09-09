/**
 * @fileoverview Idempotently establishes the initial verification billing policy.
 * @module scripts/bootstrap-billing
 */

import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function requireNonNegativeInteger(name: string, value: string | undefined): bigint {
  if (value === undefined) {
    throw new Error(`${name} is required.`);
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a nonnegative integer number of cents.`);
  }
  return BigInt(value);
}

function requireBasisPoints(value: string | undefined): number {
  if (value === undefined) {
    throw new Error("--platform-share-bps is required.");
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) {
    throw new Error("--platform-share-bps must be an integer between 0 and 10000.");
  }
  return parsed;
}

const KNOWN_FLAGS = ["--platform-share-bps", "--legacy-fee-minor"];

function hasPrismaErrorCode(error: unknown, codes: string[]) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    codes.includes(error.code)
  );
}

async function main() {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (KNOWN_FLAGS.includes(argument)) {
      index += 1;
      continue;
    }
    throw new Error(`Unknown billing bootstrap argument: ${argument}`);
  }

  const platformBasisPoints = requireBasisPoints(readFlag("--platform-share-bps"));
  const legacyFeeMinor = requireNonNegativeInteger("--legacy-fee-minor", readFlag("--legacy-fee-minor"));

  const { prisma } = await import("../src/lib/db/prisma");
  const { env } = await import("../src/lib/config/env");
  const { bootstrapVerificationBillingPolicies } = await import("../src/lib/billing/policy");

  try {
    const universities = await prisma.universityProfile.findMany({
      orderBy: { createdAt: "asc" },
      take: 2,
      select: { id: true, name: true, abbreviation: true },
    });

    if (universities.length === 0) {
      throw new Error(
        "No university profile exists. Complete the university setup wizard before bootstrapping billing.",
      );
    }
    if (universities.length > 1) {
      throw new Error(
        "Multiple university profiles exist. Billing bootstrap requires exactly one profile per deployment.",
      );
    }

    const university = universities[0];
    const result = await prisma.$transaction(
      (transaction) =>
        bootstrapVerificationBillingPolicies(transaction, {
          universityId: university.id,
          verificationFeeMinor: BigInt(env.VERIFICATION_FEE_MINOR),
          legacyFeeMinor,
          platformBasisPoints,
        }),
      { isolationLevel: "Serializable" },
    );

    console.log(`Verification billing policy ready for ${university.name} (${university.abbreviation}).`);
    if (!result.created) {
      console.log(
        `An open policy already exists (version ${result.livePolicy.version}, ${result.livePolicy.platformBasisPoints} bps). Bootstrap made no changes.`,
      );
      return;
    }

    console.log(
      `Legacy import policy: version ${result.legacyPolicy!.version}, fee ${legacyFeeMinor.toString()} minor, ${platformBasisPoints} bps, covers up to ${result.legacyPolicy!.effectiveTo!.toISOString()}.`,
    );
    console.log(
      `Live policy: version ${result.livePolicy.version}, fee ${env.VERIFICATION_FEE_MINOR} minor, ${platformBasisPoints} bps, effective from ${result.livePolicy.effectiveFrom.toISOString()}.`,
    );
  } catch (error) {
    if (hasPrismaErrorCode(error, ["P2021", "P2022"])) {
      throw new Error(
        "The verification billing schema is not available. Apply committed migrations with `npx prisma migrate deploy`, then rerun this command.",
        { cause: error },
      );
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
