/**
 * @fileoverview Records durable, deduplicated billing exceptions without ever breaking the caller.
 * Deliberately not "server-only": CLI scripts call this outside the Next.js
 * server bundle, matching `src/lib/payments/foundation.ts`'s precedent.
 * @module lib/billing/exceptions
 */

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

type ExceptionClient = Pick<Prisma.TransactionClient, "billingException">;

export type RecordBillingExceptionInput = {
  type: string;
  dedupeKey: string;
  invoiceId?: string;
  chargeId?: string;
  attemptId?: string;
  eventId?: string;
  details: Record<string, unknown>;
};

/**
 * Upserts by `dedupeKey` so repeated processing of the same underlying
 * problem (e.g. re-polling the same verification) never creates duplicate
 * exception rows. Never throws — recording an exception must not itself
 * become a reason to fail the caller's primary operation.
 */
export async function recordBillingException(
  client: ExceptionClient = prisma,
  input: RecordBillingExceptionInput,
) {
  try {
    return await client.billingException.upsert({
      where: { dedupeKey: input.dedupeKey },
      create: {
        type: input.type,
        dedupeKey: input.dedupeKey,
        invoiceId: input.invoiceId,
        chargeId: input.chargeId,
        attemptId: input.attemptId,
        eventId: input.eventId,
        details: input.details as Prisma.InputJsonValue,
      },
      update: {
        details: input.details as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.error("Failed to record billing exception", input.type, error);
    return null;
  }
}
