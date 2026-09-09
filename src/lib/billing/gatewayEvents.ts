/**
 * @fileoverview Records inbound provider events for signature-audited replay dedup.
 * Deliberately not "server-only": CLI scripts (e.g. `scripts/paystack-check.ts`)
 * may need to call this outside the Next.js server bundle, matching
 * `src/lib/payments/foundation.ts`'s precedent.
 * @module lib/billing/gatewayEvents
 */

import { createHash } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";

export type GatewayEventClient = Pick<Prisma.TransactionClient, "billingGatewayEvent">;

export type RecordGatewayEventInput = {
  provider: string;
  providerAccountRef: string;
  providerMode: string;
  eventType: string;
  /** The provider's own identity for this specific occurrence — e.g. the transaction reference for `charge.success`. */
  resourceKey: string;
  rawBody: string;
  /** Non-sensitive fields only — never the raw `authorization`/`customer` objects. */
  payloadSnapshot?: Record<string, unknown>;
};

export type RecordGatewayEventResult = {
  id: string;
  /** True if this exact (provider, account, mode, eventType, resourceKey) was already recorded — the caller must not reprocess it. */
  duplicate: boolean;
};

function bodyHashOf(rawBody: string) {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

/**
 * Upserts by the event's natural identity so a retried/replayed delivery is
 * recognized before any financial effect runs. The unique constraint is the
 * final guard against a race between two concurrent deliveries of the same
 * event; this function itself is not transactional beyond that.
 */
export async function recordGatewayEvent(client: GatewayEventClient, input: RecordGatewayEventInput): Promise<RecordGatewayEventResult> {
  const existing = await client.billingGatewayEvent.findUnique({
    where: {
      provider_providerAccountRef_providerMode_eventType_resourceKey: {
        provider: input.provider,
        providerAccountRef: input.providerAccountRef,
        providerMode: input.providerMode,
        eventType: input.eventType,
        resourceKey: input.resourceKey,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return { id: existing.id, duplicate: true };
  }

  try {
    const created = await client.billingGatewayEvent.create({
      data: {
        provider: input.provider,
        providerAccountRef: input.providerAccountRef,
        providerMode: input.providerMode,
        eventType: input.eventType,
        resourceKey: input.resourceKey,
        bodyHash: bodyHashOf(input.rawBody),
        payloadSnapshot: input.payloadSnapshot as Prisma.InputJsonValue | undefined,
      },
      select: { id: true },
    });
    return { id: created.id, duplicate: false };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      // Lost a race with a concurrent delivery of the same event.
      const raced = await client.billingGatewayEvent.findUniqueOrThrow({
        where: {
          provider_providerAccountRef_providerMode_eventType_resourceKey: {
            provider: input.provider,
            providerAccountRef: input.providerAccountRef,
            providerMode: input.providerMode,
            eventType: input.eventType,
            resourceKey: input.resourceKey,
          },
        },
        select: { id: true },
      });
      return { id: raced.id, duplicate: true };
    }
    throw error;
  }
}

export async function markGatewayEventProcessed(client: GatewayEventClient, id: string, processedAt: Date = new Date()) {
  await client.billingGatewayEvent.update({
    where: { id },
    data: { processedAt, processingError: null },
  });
}

/** Bounded backoff for the durable retry-with-lease inbox pattern (full scheduling lands in Phase 6). */
export async function recordGatewayEventFailure(client: GatewayEventClient, id: string, error: unknown, retryDelaySeconds: number) {
  const message = error instanceof Error ? error.message : String(error);
  await client.billingGatewayEvent.update({
    where: { id },
    data: {
      processingError: message.slice(0, 2000),
      retryCount: { increment: 1 },
      nextAttemptAt: new Date(Date.now() + retryDelaySeconds * 1000),
      leaseExpiresAt: null,
    },
  });
}
