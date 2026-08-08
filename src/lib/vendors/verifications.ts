import "server-only";

import {
  createCheckoutVerificationSession,
  getInPersonVerificationDetails,
  getVerificationResult,
  type AgentVerificationResult,
} from "@/lib/agentClient";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { ensureVendorVerificationServicePoint } from "@/lib/vendors/applications";
import { deliverVendorWebhook } from "@/lib/vendors/integrations";
import {
  mapAgentVerificationDecision,
  normalizedVerificationAttributes,
  summarizeVerificationStudent,
  vendorVerificationFailureReason,
} from "@/lib/vendors/verificationContract";

export type VerificationCompletedEvent = {
  type: "verification.completed";
  eventId: string;
  verificationRequestId: string;
  checkoutId?: string;
  vendorId: string;
  servicePointId: string;
  decision: AgentVerificationResult["status"];
  isVerified?: boolean;
  attributes?: unknown;
  failureCode?: string;
  expiresAt: string;
  completedAt: string;
  timestamp: string;
};

async function getAgentVerificationMetadata(
  verificationRequestId: string | null,
  servicePointId: string | null,
) {
  if (!verificationRequestId) return { attributes: null, isVerified: null };

  try {
    const result = await getInPersonVerificationDetails(verificationRequestId);
    if (result.servicePointId && servicePointId && result.servicePointId !== servicePointId) {
      return { attributes: null, isVerified: null };
    }
    return {
      attributes: normalizedVerificationAttributes(result.attributes),
      isVerified: result.isVerified ?? null,
    };
  } catch {
    return { attributes: null, isVerified: null };
  }
}

function resultShape(verification: {
  verificationRequestId: string | null;
  checkoutId: string | null;
  status: string;
  isVerified?: boolean | null;
  failureCode: string | null;
  attributes?: unknown;
  createdAt: Date;
  expiresAt: Date | null;
  completedAt: Date | null;
}) {
  const attributes = normalizedVerificationAttributes(verification.attributes);
  return {
    verificationRequestId: verification.verificationRequestId,
    checkoutId: verification.checkoutId,
    status: verification.status,
    isVerified: verification.isVerified ?? null,
    failureCode: verification.failureCode,
    failureReason: vendorVerificationFailureReason(verification.failureCode),
    attributes,
    student: summarizeVerificationStudent(attributes),
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
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: vendorProfileId },
    include: { defaultBranch: true },
  });
  const branch = vendor?.defaultBranch;
  if (!vendor || !branch?.agentServicePointId) throw new Error("Vendor verification service point is not configured.");

  const agentResult = await createCheckoutVerificationSession({
    vendorId: vendor.id,
    servicePointId: branch.agentServicePointId,
    checkoutId: normalizedCheckoutId,
  });
  const verification = await prisma.vendorVerification.upsert({
    where: { vendorProfileId_checkoutId: { vendorProfileId, checkoutId: normalizedCheckoutId } },
    create: {
      vendorProfileId,
      branchId: branch.id,
      verificationRequestId: agentResult.verificationRequestId,
      checkoutId: normalizedCheckoutId,
      servicePointId: branch.agentServicePointId,
      servicePointName: branch.name,
      status: mapAgentVerificationDecision(agentResult.status),
      failureCode: agentResult.failureCode ?? null,
      expiresAt: new Date(agentResult.expiresAt),
      completedAt: agentResult.completedAt ? new Date(agentResult.completedAt) : null,
    },
    update: {},
  });

  return { ...resultShape(verification), verificationUrl: agentResult.verificationUrl };
}

export async function getVendorVerificationResult(
  vendorProfileId: string,
  verificationRequestId: string,
  allowedBranchIds?: string[],
) {
  let verification = await prisma.vendorVerification.findFirst({
    where: {
      vendorProfileId,
      verificationRequestId,
      ...(allowedBranchIds ? { branchId: { in: allowedBranchIds } } : {}),
    },
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

  const branch = await prisma.vendorBranch.findFirst({
    where: { vendorProfileId: payload.vendorId, agentServicePointId: payload.servicePointId },
    select: { id: true, name: true },
  });
  if (!branch) throw new Error("Verification event service point is not registered to this vendor.");

  let attributes = normalizedVerificationAttributes(payload.attributes);
  let isVerified = payload.isVerified ?? null;
  if (!attributes) {
    const metadata = await getAgentVerificationMetadata(payload.verificationRequestId, payload.servicePointId);
    attributes = metadata.attributes;
    isVerified = isVerified ?? metadata.isVerified;
  }
  const storedAttributes = attributes ?? Prisma.DbNull;
  const verification = await prisma.vendorVerification.upsert({
    where: { verificationRequestId: payload.verificationRequestId },
    create: {
      vendorProfileId: payload.vendorId,
      branchId: branch.id,
      verificationRequestId: payload.verificationRequestId,
      checkoutId: payload.checkoutId,
      eventId: payload.eventId,
      servicePointId: payload.servicePointId,
      servicePointName: branch.name,
      status: mapAgentVerificationDecision(payload.decision),
      isVerified,
      failureCode: payload.failureCode ?? null,
      attributes: storedAttributes,
      expiresAt: new Date(payload.expiresAt),
      completedAt: new Date(payload.completedAt),
    },
    update: {
      eventId: payload.eventId,
      branchId: branch.id,
      servicePointName: branch.name,
      status: mapAgentVerificationDecision(payload.decision),
      isVerified,
      failureCode: payload.failureCode ?? null,
      attributes: storedAttributes,
      expiresAt: new Date(payload.expiresAt),
      completedAt: new Date(payload.completedAt),
    },
  });

  if (verification.checkoutId) await deliverVendorWebhook(verification.id, requestId);
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

export async function getVendorVerificationStats(
  vendorProfileId: string,
  options: { branchIds?: string[]; inPersonOnly?: boolean } = {},
) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const where = {
    vendorProfileId,
    ...(options.branchIds ? { branchId: { in: options.branchIds } } : {}),
    ...(options.inPersonOnly ? { checkoutId: null } : {}),
  };
  const [total, approved, pending, thisMonth] = await Promise.all([
    prisma.vendorVerification.count({ where }),
    prisma.vendorVerification.count({ where: { ...where, status: "APPROVED" } }),
    prisma.vendorVerification.count({ where: { ...where, status: "PENDING" } }),
    prisma.vendorVerification.count({ where: { ...where, createdAt: { gte: startOfMonth } } }),
  ]);
  return { total, approved, pending, thisMonth };
}

export async function listRecentVendorVerifications(
  vendorProfileId: string,
  limit = 5,
  options: { branchIds?: string[]; inPersonOnly?: boolean } = {},
) {
  const verifications = await prisma.vendorVerification.findMany({
    where: {
      vendorProfileId,
      ...(options.branchIds ? { branchId: { in: options.branchIds } } : {}),
      ...(options.inPersonOnly ? { checkoutId: null } : {}),
    },
    include: { deliveries: { orderBy: { attemptNumber: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return Promise.all(verifications.map(async (verification) => {
    const storedAttributes = normalizedVerificationAttributes(verification.attributes);
    if (storedAttributes || !verification.verificationRequestId || verification.checkoutId) return verification;

    const metadata = await getAgentVerificationMetadata(verification.verificationRequestId, verification.servicePointId);
    if (!metadata.attributes) return verification;

    return {
      ...verification,
      attributes: metadata.attributes,
      isVerified: verification.isVerified ?? metadata.isVerified,
    };
  }));
}
