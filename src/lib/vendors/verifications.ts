import "server-only";

import {
  createCheckoutVerificationSession,
  getVerificationResult,
  type AgentVerificationResult,
} from "@/lib/agentClient";
import { prisma } from "@/lib/db/prisma";
import { ensureVendorVerificationServicePoint } from "@/lib/vendors/applications";
import { deliverVendorWebhook } from "@/lib/vendors/integrations";
import { mapAgentVerificationDecision } from "@/lib/vendors/verificationContract";

export type VerificationCompletedEvent = {
  type: "verification.completed";
  eventId: string;
  verificationRequestId: string;
  checkoutId?: string;
  vendorId: string;
  servicePointId: string;
  decision: AgentVerificationResult["status"];
  failureCode?: string;
  expiresAt: string;
  completedAt: string;
  timestamp: string;
};

function resultShape(verification: {
  verificationRequestId: string | null;
  checkoutId: string | null;
  status: string;
  failureCode: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  completedAt: Date | null;
}) {
  return {
    verificationRequestId: verification.verificationRequestId,
    checkoutId: verification.checkoutId,
    status: verification.status,
    failureCode: verification.failureCode,
    createdAt: verification.createdAt.toISOString(),
    expiresAt: verification.expiresAt?.toISOString() ?? null,
    completedAt: verification.completedAt?.toISOString() ?? null,
  };
}

async function applyAgentResult(id: string, result: AgentVerificationResult) {
  return prisma.vendorVerification.update({
    where: { id },
    data: {
      status: mapAgentVerificationDecision(result.status),
      failureCode: result.failureCode ?? null,
      expiresAt: new Date(result.expiresAt),
      completedAt: result.completedAt ? new Date(result.completedAt) : null,
    },
  });
}

export async function createVendorCheckoutSession(vendorProfileId: string, checkoutId: string) {
  const normalizedCheckoutId = checkoutId.trim();
  if (!normalizedCheckoutId || normalizedCheckoutId.length > 128) {
    throw new Error("checkoutId must contain between 1 and 128 characters.");
  }

  await ensureVendorVerificationServicePoint(vendorProfileId);
  const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorProfileId } });
  if (!vendor?.agentServicePointId) throw new Error("Vendor verification service point is not configured.");

  const agentResult = await createCheckoutVerificationSession({
    vendorId: vendor.id,
    servicePointId: vendor.agentServicePointId,
    checkoutId: normalizedCheckoutId,
  });
  const verification = await prisma.vendorVerification.upsert({
    where: { vendorProfileId_checkoutId: { vendorProfileId, checkoutId: normalizedCheckoutId } },
    create: {
      vendorProfileId,
      verificationRequestId: agentResult.verificationRequestId,
      checkoutId: normalizedCheckoutId,
      servicePointId: vendor.agentServicePointId,
      servicePointName: vendor.companyName,
      status: mapAgentVerificationDecision(agentResult.status),
      failureCode: agentResult.failureCode ?? null,
      expiresAt: new Date(agentResult.expiresAt),
      completedAt: agentResult.completedAt ? new Date(agentResult.completedAt) : null,
    },
    update: {},
  });

  return { ...resultShape(verification), verificationUrl: agentResult.verificationUrl };
}

export async function getVendorVerificationResult(vendorProfileId: string, verificationRequestId: string) {
  let verification = await prisma.vendorVerification.findFirst({
    where: { vendorProfileId, verificationRequestId },
  });
  if (!verification) return null;

  if (verification.status === "PENDING" && verification.verificationRequestId) {
    const agentResult = await getVerificationResult(verification.verificationRequestId);
    verification = await applyAgentResult(verification.id, agentResult);
  }
  return resultShape(verification);
}

export async function recordVerificationCompletedEvent(payload: VerificationCompletedEvent, requestId?: string) {
  const duplicate = await prisma.vendorVerification.findUnique({ where: { eventId: payload.eventId } });
  if (duplicate) return { duplicate: true, verification: duplicate };

  const existing = await prisma.vendorVerification.findUnique({
    where: { verificationRequestId: payload.verificationRequestId },
  });
  if (
    existing &&
    (existing.vendorProfileId !== payload.vendorId ||
      (existing.servicePointId !== null && existing.servicePointId !== payload.servicePointId) ||
      (existing.checkoutId !== null && existing.checkoutId !== payload.checkoutId))
  ) {
    throw new Error("Verification event does not match the stored checkout binding.");
  }

  const verification = await prisma.vendorVerification.upsert({
    where: { verificationRequestId: payload.verificationRequestId },
    create: {
      vendorProfileId: payload.vendorId,
      verificationRequestId: payload.verificationRequestId,
      checkoutId: payload.checkoutId,
      eventId: payload.eventId,
      servicePointId: payload.servicePointId,
      status: mapAgentVerificationDecision(payload.decision),
      failureCode: payload.failureCode ?? null,
      expiresAt: new Date(payload.expiresAt),
      completedAt: new Date(payload.completedAt),
    },
    update: {
      eventId: payload.eventId,
      status: mapAgentVerificationDecision(payload.decision),
      failureCode: payload.failureCode ?? null,
      expiresAt: new Date(payload.expiresAt),
      completedAt: new Date(payload.completedAt),
    },
  });

  await deliverVendorWebhook(verification.id, requestId);
  return { duplicate: false, verification };
}

export async function retryVendorWebhook(vendorProfileId: string, verificationId: string) {
  const verification = await prisma.vendorVerification.findFirst({
    where: { id: verificationId, vendorProfileId },
    select: { id: true },
  });
  if (!verification) throw new Error("Verification result was not found.");
  return deliverVendorWebhook(verification.id);
}

export async function getVendorVerificationStats(vendorProfileId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [total, approved, pending, thisMonth] = await Promise.all([
    prisma.vendorVerification.count({ where: { vendorProfileId } }),
    prisma.vendorVerification.count({ where: { vendorProfileId, status: "APPROVED" } }),
    prisma.vendorVerification.count({ where: { vendorProfileId, status: "PENDING" } }),
    prisma.vendorVerification.count({ where: { vendorProfileId, createdAt: { gte: startOfMonth } } }),
  ]);
  return { total, approved, pending, thisMonth };
}

export async function listRecentVendorVerifications(vendorProfileId: string, limit = 5) {
  return prisma.vendorVerification.findMany({
    where: { vendorProfileId },
    include: { deliveries: { orderBy: { attemptNumber: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
