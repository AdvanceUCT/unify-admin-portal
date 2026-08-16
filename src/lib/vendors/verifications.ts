/**
 * @fileoverview Creates, scopes, materializes, exports, and retries vendor verification records.
 * @module lib/vendors/verifications
 */

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
const VERIFICATION_EVENTS_EXPORT_LIMIT = 10_000;

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
      // Never attach disclosed attributes to a record bound to another service
      // point, even if the verification request identifier was supplied correctly.
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

type VendorVerificationResultRow = {
  verificationRequestId: string | null;
  checkoutId: string | null;
  status: string;
  isVerified?: boolean | null;
  failureCode: string | null;
  attributes?: unknown;
  createdAt: Date;
  expiresAt: Date | null;
  completedAt: Date | null;
};

/**
 * Public checkout result. External systems only need the decision and the
 * checkout correlation identifiers; disclosed credential data stays inside
 * the portal's in-person verification boundary.
 */
function checkoutResultShape(verification: VendorVerificationResultRow) {
  return {
    verificationRequestId: verification.verificationRequestId,
    checkoutId: verification.checkoutId,
    status: verification.status,
    failureCode: verification.failureCode,
    failureReason: vendorVerificationFailureReason(verification.failureCode),
    createdAt: verification.createdAt.toISOString(),
    expiresAt: verification.expiresAt?.toISOString() ?? null,
    completedAt: verification.completedAt?.toISOString() ?? null,
  };
}

/** Detailed result used only by the authenticated, branch-scoped vendor portal. */
function inPersonResultShape(verification: VendorVerificationResultRow) {
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
  // Vendor and branch scoping is the tenant-isolation boundary. User-selected
  // filters may narrow this predicate but must never replace it.
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

/** Creates or reuses the checkout verification record identified by the vendor's checkout ID. */
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
  // vendorProfileId + checkoutId is the caller's idempotency key. Retrying a
  // checkout must return the existing record rather than create a second result.
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

  return { ...checkoutResultShape(verification), verificationUrl: agentResult.verificationUrl };
}

/** Returns a branch-scoped in-person verification with its disclosed attributes. */
export async function getVendorVerificationResult(
  vendorProfileId: string,
  verificationRequestId: string,
  allowedBranchIds?: string[],
) {
  let verification = await prisma.vendorVerification.findFirst({
    where: {
      vendorProfileId,
      verificationRequestId,
      checkoutId: null,
      ...(allowedBranchIds ? { branchId: { in: allowedBranchIds } } : {}),
    },
  });
  if (!verification) return null;

  if (verification.status === "PENDING" && verification.verificationRequestId) {
    // The backend verifier is authoritative; the portal only materializes its
    // latest terminal decision and never accepts a client-supplied proof result.
    const agentResult = await getVerificationResult(verification.verificationRequestId);
    verification = await applyAgentResult(verification.id, agentResult);
  }
  return inPersonResultShape(verification);
}

/** Returns the minimal external-checkout result and refreshes pending agent state. */
export async function getVendorCheckoutVerificationResult(
  vendorProfileId: string,
  verificationRequestId: string,
) {
  let verification = await prisma.vendorVerification.findFirst({
    where: {
      vendorProfileId,
      verificationRequestId,
      checkoutId: { not: null },
    },
  });
  if (!verification) return null;

  if (verification.status === "PENDING" && verification.verificationRequestId) {
    const agentResult = await getVerificationResult(verification.verificationRequestId);
    verification = await applyAgentResult(verification.id, agentResult);
  }
  return checkoutResultShape(verification);
}

/** Validates webhook bindings before materializing the agent's completed verification result. */
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
    // Reject attempts to replay a valid event identifier into a different
    // vendor, service point, or checkout context.
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
    // Older/minimal webhook payloads can be enriched from the agent only after
    // the service-point ownership checks above have succeeded.
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

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

/** Exports a bounded, tenant-scoped verification history using the active filters. */
export async function exportVendorVerificationEventsCsv(
  vendorProfileId: string,
  allowedBranchIds: string[],
  filters: VendorVerificationEventFilters = {},
) {
  // Bound exports so one request cannot load an unbounded tenant history into
  // the serverless function's memory.
  const rows = await prisma.vendorVerification.findMany({
    where: verificationEventsWhere(vendorProfileId, allowedBranchIds, filters),
    include: { branch: { select: { name: true } } },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: VERIFICATION_EVENTS_EXPORT_LIMIT,
  });
  const header = [
    "Completed At",
    "Created At",
    "Branch",
    "Status",
    "Student Name",
    "Student Number",
    "University",
    "Failure Code",
    "Failure Reason",
    "Verification Request ID",
    "Event ID",
  ];
  const body = rows.map((row) => {
    const attributes = normalizedVerificationAttributes(row.attributes);
    const student = summarizeVerificationStudent(attributes);
    return [
      row.completedAt?.toISOString() ?? "",
      row.createdAt.toISOString(),
      row.branch?.name ?? row.servicePointName ?? "",
      row.status,
      student.name,
      student.id,
      student.university,
      row.failureCode,
      vendorVerificationFailureReason(row.failureCode),
      row.verificationRequestId,
      row.eventId,
    ].map(csvCell).join(",");
  });

  return [header.map(csvCell).join(","), ...body].join("\r\n");
}
