/**
 * @fileoverview Resolves the single university profile billing services depend on.
 * Deliberately not "server-only": CLI scripts call this outside the Next.js
 * server bundle, matching `src/lib/payments/foundation.ts`'s precedent.
 * @module lib/billing/config
 */

import type { Prisma } from "@/generated/prisma/client";
import { BillingDomainError } from "@/lib/billing/errors";
import { prisma } from "@/lib/db/prisma";

type UniversityLookupClient = Pick<Prisma.TransactionClient, "universityProfile">;

/** This deployment assumes exactly one university profile, same as the payment wallet foundation. */
export async function requireSingleUniversityId(client: UniversityLookupClient = prisma): Promise<string> {
  const universities = await client.universityProfile.findMany({
    take: 2,
    select: { id: true },
  });

  if (universities.length !== 1) {
    throw new BillingDomainError(
      "UNIVERSITY_NOT_CONFIGURED",
      "Exactly one university profile is required for billing.",
    );
  }

  return universities[0].id;
}
