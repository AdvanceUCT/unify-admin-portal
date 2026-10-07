import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { PosApiError } from "@/lib/payments/posErrors";

const selection = {
  id: true, attemptNumber: true, status: true, responseStatus: true, attemptedAt: true,
  vendorVerification: { select: { id: true, verificationRequestId: true, checkoutId: true, status: true } },
} as const;

/** Owner history projects delivery metadata only. Stored errors and student details never leave this boundary. */
export async function verificationWebhookHistory(vendorProfileId: string, search: URLSearchParams) {
  const { cursor, limit } = z.object({ cursor: z.string().min(1).max(128).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict().parse(Object.fromEntries(search));
  const tenant = { vendorVerification: { vendorProfileId, checkoutId: { not: null } } };
  const anchor = cursor ? await prisma.vendorWebhookDelivery.findFirst({ where: { ...tenant, id: cursor }, select: { id: true, attemptedAt: true } }) : null;
  if (cursor && !anchor) throw new PosApiError("INVALID_CURSOR", "Invalid history cursor.");
  const [rows, latestSuccess] = await Promise.all([
    prisma.vendorWebhookDelivery.findMany({
      where: { ...tenant, ...(anchor ? { OR: [{ attemptedAt: { lt: anchor.attemptedAt } }, { attemptedAt: anchor.attemptedAt, id: { lt: anchor.id } }] } : {}) },
      orderBy: [{ attemptedAt: "desc" }, { id: "desc" }], take: limit + 1, select: selection,
    }),
    prisma.vendorWebhookDelivery.findFirst({ where: { ...tenant, status: "DELIVERED" }, orderBy: [{ attemptedAt: "desc" }, { id: "desc" }], select: { attemptedAt: true } }),
  ]);
  return {
    items: rows.slice(0, limit).map(row => ({
      id: row.id, verificationId: row.vendorVerification.id, verificationRequestId: row.vendorVerification.verificationRequestId,
      checkoutId: row.vendorVerification.checkoutId, verificationStatus: row.vendorVerification.status,
      attemptNumber: row.attemptNumber, status: row.status, httpStatus: row.responseStatus, attemptedAt: row.attemptedAt.toISOString(),
      failureReason: row.status === "DELIVERED" ? null : row.responseStatus === null ? "Receiver could not be reached." : "Receiver did not accept the callback.",
    })),
    nextCursor: rows.length > limit ? rows[limit - 1].id : null,
    lastSuccess: latestSuccess?.attemptedAt.toISOString() ?? null,
  };
}
