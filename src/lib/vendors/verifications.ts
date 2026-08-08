import "server-only";

import {
  createCheckoutVerificationSession,
  getInPersonVerificationDetails,
  getVerificationResult,
  type AgentVerificationResult,
} from "@/lib/agentClient";
import { Prisma } from "@/generated/prisma/client";
import type { VendorVerificationStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { ensureVendorVerificationServicePoint } from "@/lib/vendors/applications";
import { deliverVendorWebhook } from "@/lib/vendors/integrations";
import {
  mapAgentVerificationDecision,
  normalizedVerificationAttributes,
  summarizeVerificationStudent,
  vendorVerificationFailureReason,
} from "@/lib/vendors/verificationContract";

const VERIFICATION_EVENTS_PAGE_SIZE = 10;

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

export type VendorVerificationEventFilters = {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  query?: string;
  university?: string;
};

type VerificationEventRow = {
  id: string;
  branchId: string | null;
  branch?: { name: string } | null;
  servicePointName: string | null;
  verificationRequestId: string | null;
  status: VendorVerificationStatus;
  isVerified: boolean | null;
  failureCode: string | null;
  attributes: unknown;
  createdAt: Date;
  completedAt: Date | null;
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

function parsedDate(value: string | undefined, endOfDay = false) {
  if (!value) return undefined;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function normalizedPage(value: number | undefined) {
  return Number.isInteger(value) && value && value > 0 ? value : 1;
}

function searchFilters(query: string): Prisma.VendorVerificationWhereInput[] {
  const search = query.trim();
  if (!search) return [];

  return [
    { attributes: { path: ["fullName"], string_contains: search, mode: "insensitive" } },
    { attributes: { path: ["firstName"], string_contains: search, mode: "insensitive" } },
    { attributes: { path: ["lastName"], string_contains: search, mode: "insensitive" } },
    { attributes: { path: ["studentNumber"], string_contains: search, mode: "insensitive" } },
    { attributes: { path: ["studentId"], string_contains: search, mode: "insensitive" } },
  ];
}

function universityFilters(university: string): Prisma.VendorVerificationWhereInput[] {
  const value = university.trim();
  if (!value) return [];

  return [
    { attributes: { path: ["institution"], equals: value } },
    { attributes: { path: ["university"], equals: value } },
    { attributes: { path: ["universityName"], equals: value } },
    { attributes: { path: ["issuer"], equals: value } },
  ];
}

function verificationEventsWhere(
  vendorProfileId: string,
  allowedBranchIds: string[],
  filters: VendorVerificationEventFilters = {},
): Prisma.VendorVerificationWhereInput {
  const dateFrom = parsedDate(filters.dateFrom);
  const dateTo = parsedDate(filters.dateTo, true);
  const branchIds = filters.branchId && allowedBranchIds.includes(filters.branchId)
    ? [filters.branchId]
    : allowedBranchIds;
  const and: Prisma.VendorVerificationWhereInput[] = [
    {
      vendorProfileId,
      branchId: { in: branchIds },
      checkoutId: null,
    },
  ];

  if (dateFrom || dateTo) {
    and.push({ completedAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } });
  }

  const queryFilters = searchFilters(filters.query ?? "");
  if (queryFilters.length > 0) and.push({ OR: queryFilters });

  const selectedUniversityFilters = universityFilters(filters.university ?? "");
  if (selectedUniversityFilters.length > 0) and.push({ OR: selectedUniversityFilters });

  return { AND: and };
}

function verificationEventShape(verification: VerificationEventRow) {
  const attributes = normalizedVerificationAttributes(verification.attributes);

  return {
    id: verification.id,
    branchId: verification.branchId,
    branchName: verification.branch?.name ?? verification.servicePointName ?? "Branch",
    verificationRequestId: verification.verificationRequestId,
    status: verification.status,
    isVerified: verification.isVerified,
    failureCode: verification.failureCode,
    failureReason: vendorVerificationFailureReason(verification.failureCode),
    attributes,
    student: summarizeVerificationStudent(attributes),
    createdAt: verification.createdAt.toISOString(),
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

export async function listVendorVerificationEvents(
  vendorProfileId: string,
  allowedBranchIds: string[],
  filters: VendorVerificationEventFilters = {},
) {
  const page = normalizedPage(filters.page);
  const where = verificationEventsWhere(vendorProfileId, allowedBranchIds, filters);
  const [total, rows] = await Promise.all([
    prisma.vendorVerification.count({ where }),
    prisma.vendorVerification.findMany({
      where,
      include: { branch: { select: { name: true } } },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * VERIFICATION_EVENTS_PAGE_SIZE,
      take: VERIFICATION_EVENTS_PAGE_SIZE,
    }),
  ]);

  return {
    events: rows.map(verificationEventShape),
    page,
    pageSize: VERIFICATION_EVENTS_PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / VERIFICATION_EVENTS_PAGE_SIZE)),
  };
}

export async function listVendorVerificationUniversities(
  vendorProfileId: string,
  allowedBranchIds: string[],
) {
  const rows = await prisma.vendorVerification.findMany({
    where: {
      vendorProfileId,
      branchId: { in: allowedBranchIds },
      checkoutId: null,
      attributes: { not: Prisma.DbNull },
    },
    select: { attributes: true },
    orderBy: { createdAt: "desc" },
  });

  const universities = new Set<string>();
  for (const row of rows) {
    const student = summarizeVerificationStudent(normalizedVerificationAttributes(row.attributes));
    if (student.university) universities.add(student.university);
  }

  return Array.from(universities).sort((left, right) => left.localeCompare(right));
}
