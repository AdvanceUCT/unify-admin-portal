import "server-only";

import { getInPersonVerificationDetails } from "@/lib/agentClient";
import { prisma } from "@/lib/db/prisma";
import type { ApprovedVendorContext } from "@/lib/vendors/context";
import {
  normalizedVerificationAttributes,
  summarizeVerificationStudent,
  vendorVerificationFailureReason,
} from "@/lib/vendors/verificationContract";

type Cursor = { completedAt: string; id: string };

export function encodeLiveVerificationCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeLiveVerificationCursor(value: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    if (!parsed.id || !Number.isFinite(Date.parse(parsed.completedAt))) throw new Error();
    return parsed;
  } catch {
    throw new Error("Invalid live verification cursor.");
  }
}

export async function getLiveVerificationEvents(
  context: ApprovedVendorContext,
  rawCursor?: string,
  options: { branchIds?: string[] } = {},
) {
  if (!rawCursor) {
    return {
      events: [],
      nextCursor: encodeLiveVerificationCursor({ completedAt: new Date().toISOString(), id: "_" }),
    };
  }
  const branchIds = options.branchIds?.filter((branchId) => context.branchIds.includes(branchId)) ?? context.branchIds;
  const cursor = decodeLiveVerificationCursor(rawCursor);
  const completedAt = new Date(cursor.completedAt);
  const verifications = await prisma.vendorVerification.findMany({
    where: {
      vendorProfileId: context.vendorProfileId,
      branchId: { in: branchIds },
      checkoutId: null,
      completedAt: { not: null },
      OR: [
        { completedAt: { gt: completedAt } },
        { completedAt, id: { gt: cursor.id } },
      ],
    },
    include: { branch: { select: { id: true, name: true } } },
    orderBy: [{ completedAt: "asc" }, { id: "asc" }],
    take: 20,
  });

  const events = await Promise.all(verifications.map(async (verification) => {
    let attributes = normalizedVerificationAttributes(verification.attributes);
    let isVerified = verification.isVerified ?? null;
    if (!attributes && verification.verificationRequestId) {
      try {
        const result = await getInPersonVerificationDetails(verification.verificationRequestId);
        if (result.servicePointId === verification.servicePointId || !result.servicePointId) {
          attributes = normalizedVerificationAttributes(result.attributes);
          isVerified = result.isVerified ?? null;
        }
      } catch {
        // Identity is intentionally best-effort and expires at the agent.
      }
    }
    const student = summarizeVerificationStudent(attributes);
    const failureCode = verification.failureCode;
    return {
      eventId: verification.eventId ?? verification.id,
      verificationId: verification.id,
      branchId: verification.branchId,
      branchName: verification.branch?.name ?? verification.servicePointName ?? "Branch",
      status: verification.status,
      isVerified,
      failureCode,
      failureReason: vendorVerificationFailureReason(failureCode),
      attributes,
      student,
      studentName: student.name,
      studentNumber: student.id,
      studentUniversity: student.university,
      completedAt: verification.completedAt!.toISOString(),
    };
  }));

  const last = verifications.at(-1);
  return {
    events,
    nextCursor: last
      ? encodeLiveVerificationCursor({ completedAt: last.completedAt!.toISOString(), id: last.id })
      : rawCursor,
  };
}
