import "server-only";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/payments/posting";
import { PosApiError } from "@/lib/payments/posErrors";
import { encryptVendorSecret, decryptVendorSecret } from "./integrationCrypto";
import { resolvePaymentWebhookDestination, sendPaymentWebhook } from "./paymentWebhookTransport";

const configSelection = { id: true, url: true, branchIds: true, enabled: true, createdAt: true, disabledAt: true } as const;
const configSchema = z.object({ url: z.string().url().max(2048), branchIds: z.array(z.string().min(1).max(128)).min(1).max(100) }).strict();
export const PAYMENT_RETRY_DELAYS = [300_000, 900_000, 3_600_000, 21_600_000, 86_400_000];

async function lockVendor(tx: Prisma.TransactionClient, vendorId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM vendor_profile WHERE id = ${vendorId} FOR UPDATE`);
}
async function parkConfiguration(tx: Prisma.TransactionClient, vendorId: string) {
  await tx.paymentWebhookConfig.updateMany({ where: { vendorProfileId: vendorId, enabled: true }, data: { enabled: false, disabledAt: new Date() } });
  await tx.paymentWebhookDelivery.updateMany({ where: { event: { vendorProfileId: vendorId }, status: { not: "DELIVERED" } }, data: { status: "PARKED", nextAttemptAt: null, leaseToken: null, leaseExpiresAt: null } });
}
export async function configurePaymentWebhook(vendorId: string, raw: unknown) {
  const input = configSchema.parse(raw);
  await resolvePaymentWebhookDestination(input.url);
  const secret = randomBytes(32).toString("base64url");
  const configuration = await runSerializableTransaction(async (tx) => {
    await lockVendor(tx, vendorId);
    const branchIds = [...new Set(input.branchIds)];
    if (await tx.vendorBranch.count({ where: { id: { in: branchIds }, vendorProfileId: vendorId, active: true, status: "ACTIVE", paymentAcceptance: { status: "ACTIVE" } } }) !== branchIds.length) {
      throw new PosApiError("BRANCH_NOT_ALLOWED", "Select active payment-enabled branches belonging to this vendor.", 403);
    }
    await parkConfiguration(tx, vendorId);
    return tx.paymentWebhookConfig.create({ data: { vendorProfileId: vendorId, url: input.url, branchIds, secretEncrypted: encryptVendorSecret(secret) }, select: configSelection });
  });
  return { configuration, secret };
}
export async function disablePaymentWebhook(vendorId: string) {
  await runSerializableTransaction(async (tx) => { await lockVendor(tx, vendorId); await parkConfiguration(tx, vendorId); });
}
export async function getPaymentWebhookConfiguration(vendorId: string) {
  return prisma.paymentWebhookConfig.findFirst({ where: { vendorProfileId: vendorId }, orderBy: { createdAt: "desc" }, select: configSelection });
}
export async function paymentWebhookHistory(vendorId: string, search: URLSearchParams) {
  const { cursor, limit } = z.object({ cursor: z.string().max(128).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).parse(Object.fromEntries(search));
  if (cursor && !await prisma.paymentWebhookEvent.findFirst({ where: { id: cursor, vendorProfileId: vendorId } })) throw new PosApiError("INVALID_CURSOR", "Invalid page cursor.");
  const [events, lastSuccess, oldestOutstanding] = await Promise.all([
    prisma.paymentWebhookEvent.findMany({ where: { vendorProfileId: vendorId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { delivery: { include: { attempts: { orderBy: { sequence: "desc" }, take: 20 } } } } }),
    prisma.paymentWebhookDelivery.findFirst({ where: { event: { vendorProfileId: vendorId }, status: "DELIVERED" }, orderBy: { deliveredAt: "desc" }, select: { deliveredAt: true } }),
    prisma.paymentWebhookEvent.findFirst({ where: { vendorProfileId: vendorId, delivery: { status: { not: "DELIVERED" } } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  return { items: events.slice(0, limit), nextCursor: events.length > limit ? events[limit - 1].id : null, lastSuccess: lastSuccess?.deliveredAt ?? null, oldestOutstanding: oldestOutstanding?.createdAt ?? null };
}
export async function retryPaymentWebhook(vendorId: string, eventId: string) {
  return runSerializableTransaction(async (tx) => {
    await lockVendor(tx, vendorId);
    const event = await tx.paymentWebhookEvent.findFirst({ where: { id: eventId, vendorProfileId: vendorId } });
    if (!event) throw new PosApiError("EVENT_NOT_FOUND", "Event was not found.", 404);
    const config = await tx.paymentWebhookConfig.findFirst({ where: { vendorProfileId: vendorId, enabled: true, branchIds: { has: event.branchId } } });
    if (!config) throw new PosApiError("CALLBACK_DISABLED", "Configure delivery for this branch before retrying.", 409);
    const existing = await tx.paymentWebhookDelivery.findUnique({ where: { eventId } });
    if (existing?.status === "IN_FLIGHT" && existing.leaseExpiresAt && existing.leaseExpiresAt > new Date()) throw new PosApiError("DELIVERY_IN_PROGRESS", "Delivery is already in progress.", 409);
    return tx.paymentWebhookDelivery.upsert({ where: { eventId }, create: { eventId, configId: config.id }, update: { configId: config.id, status: "READY", automaticAttempts: 0, nextAttemptAt: new Date(), leaseToken: null, leaseExpiresAt: null, deliveredAt: null } });
  });
}

// Leases and fencing tokens make concurrent dispatchers and interrupted workers safe.
export async function claimPaymentWebhookDeliveries(limit = 20) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE payment_webhook_delivery d SET status = 'PARKED', "nextAttemptAt" = NULL, "leaseToken" = NULL, "leaseExpiresAt" = NULL
      FROM payment_webhook_config c WHERE c.id = d."configId" AND NOT c.enabled AND d.status NOT IN ('DELIVERED','PARKED')`;
    await tx.$executeRaw`UPDATE payment_webhook_attempt a SET outcome = 'INTERRUPTED', "errorCode" = 'WORKER_INTERRUPTED', "completedAt" = clock_timestamp()
      FROM payment_webhook_delivery d WHERE a."deliveryId" = d.id AND a.outcome = 'STARTED' AND (d.status = 'PARKED' OR d."leaseExpiresAt" <= clock_timestamp())`;
    await tx.$executeRaw`UPDATE payment_webhook_delivery SET status = 'EXHAUSTED', "nextAttemptAt" = NULL, "leaseToken" = NULL, "leaseExpiresAt" = NULL
      WHERE status = 'IN_FLIGHT' AND "leaseExpiresAt" <= clock_timestamp() AND "automaticAttempts" >= 6`;
    const due = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT d.id FROM payment_webhook_delivery d JOIN payment_webhook_config c ON c.id = d."configId"
      WHERE c.enabled AND d."automaticAttempts" < 6 AND
        ((d.status = 'READY' AND d."nextAttemptAt" <= clock_timestamp()) OR
         (d.status = 'IN_FLIGHT' AND d."leaseExpiresAt" <= clock_timestamp()))
      ORDER BY d."nextAttemptAt", d.id LIMIT ${Math.max(1, Math.min(limit, 20))} FOR UPDATE OF d SKIP LOCKED`);
    const claimed = [];
    for (const row of due) {
      const delivery = await tx.paymentWebhookDelivery.update({ where: { id: row.id }, data: { status: "IN_FLIGHT", leaseToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + 60_000), automaticAttempts: { increment: 1 }, attemptSequence: { increment: 1 } }, include: { event: true, config: true } });
      const attempt = await tx.paymentWebhookAttempt.create({ data: { deliveryId: delivery.id, configId: delivery.configId, sequence: delivery.attemptSequence } });
      claimed.push({ ...delivery, attemptId: attempt.id });
    }
    return claimed;
  });
}
type Claimed = Awaited<ReturnType<typeof claimPaymentWebhookDeliveries>>[number];
export async function deliverClaimedPaymentWebhook(delivery: Claimed, transport = sendPaymentWebhook) {
  const body = JSON.stringify(delivery.event.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  let httpStatus: number | null = null;
  let errorCode: string | null = null;
  try {
    // Recheck the revision immediately before opening the connection.
    if (!await prisma.paymentWebhookConfig.findFirst({ where: { id: delivery.configId, enabled: true } })) errorCode = "CONFIGURATION_DISABLED";
    else {
      const signature = createHmac("sha256", decryptVendorSecret(delivery.config.secretEncrypted)).update(`${timestamp}.${body}`).digest("hex");
      httpStatus = await transport(delivery.config.url, body, { "X-Unify-Signature": `sha256=${signature}`, "X-Unify-Timestamp": timestamp, "X-Unify-Event-Id": delivery.eventId });
      if (httpStatus < 200 || httpStatus >= 300) errorCode = "HTTP_REJECTED";
    }
  } catch { errorCode = "DESTINATION_UNAVAILABLE"; }
  const success = httpStatus !== null && httpStatus >= 200 && httpStatus < 300;
  await prisma.$transaction(async (tx) => {
    await tx.paymentWebhookAttempt.updateMany({ where: { id: delivery.attemptId, outcome: "STARTED" }, data: { outcome: success ? "DELIVERED" : "FAILED", httpStatus, errorCode, completedAt: new Date() } });
    await tx.paymentWebhookDelivery.updateMany({ where: { id: delivery.id, leaseToken: delivery.leaseToken, status: "IN_FLIGHT" }, data: {
      status: success ? "DELIVERED" : delivery.automaticAttempts >= 6 ? "EXHAUSTED" : "READY",
      deliveredAt: success ? new Date() : null, leaseToken: null, leaseExpiresAt: null,
      nextAttemptAt: success || delivery.automaticAttempts >= 6 ? null : new Date(Date.now() + PAYMENT_RETRY_DELAYS[delivery.automaticAttempts - 1]),
    } });
  });
}
export async function dispatchPaymentWebhooks() {
  // Bounded expiry sweep also creates events for requests nobody has read.
  await prisma.$executeRaw`UPDATE payment_request SET status = 'EXPIRED' WHERE id IN
    (SELECT id FROM payment_request WHERE status = 'PENDING' AND "expiresAt" <= clock_timestamp() ORDER BY "expiresAt" LIMIT 100 FOR UPDATE SKIP LOCKED)`;
  const deliveries = await claimPaymentWebhookDeliveries();
  for (let index = 0; index < deliveries.length; index += 4) await Promise.all(deliveries.slice(index, index + 4).map((delivery) => deliverClaimedPaymentWebhook(delivery)));
  return { processed: deliveries.length };
}
