import "server-only";

import { getInPersonVerificationDetails } from "@/lib/agentClient";
import { prisma } from "@/lib/db/prisma";
import type { ApprovedVendorContext } from "@/lib/vendors/context";

type Cursor = { completedAt: string; id: string };

const FAILURE_REASONS: Record<string, string> = {
  CREDO_PROTOCOL_ERROR: "The credential presentation could not be completed.",
  CREDENTIAL_NOT_CURRENT: "The student credential is no longer current.",
  PROOF_EXCHANGE_ABANDONED: "The student did not complete the credential presentation.",
  PROOF_NOT_VERIFIED: "The presented credential proof could not be verified.",
  PROOF_REQUEST_EXPIRED: "The verification request expired.",
  REQUIRED_ATTRIBUTE_MISSING: "The credential is missing a required attribute.",
  REVOCATION_CHECK_FAILED: "The credential revocation status could not be confirmed.",
  STUDENT_NOT_REGISTERED: "The credential does not identify a registered student.",
  UNTRUSTED_CREDENTIAL_DEFINITION: "The credential was not issued from a trusted definition.",
};

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

function studentIdentity(attributes: Record<string, string> | undefined, verified: boolean | undefined) {
  if (!verified || !attributes) return { studentName: null, studentNumber: null };
  const combined = [attributes.firstName, attributes.lastName].filter(Boolean).join(" ").trim();
  return {
    studentName: attributes.fullName?.trim() || combined || null,
    studentNumber: attributes.studentNumber?.trim() || null,
  };
}

export async function getLiveVerificationEvents(context: ApprovedVendorContext, rawCursor?: string) {
  if (!rawCursor) {
    return {
      events: [],
      nextCursor: encodeLiveVerificationCursor({ completedAt: new Date().toISOString(), id: "_" }),
    };
  }
  const cursor = decodeLiveVerificationCursor(rawCursor);
  const completedAt = new Date(cursor.completedAt);
  const verifications = await prisma.vendorVerification.findMany({
    where: {
      vendorProfileId: context.vendorProfileId,
      branchId: { in: context.branchIds },
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
    let identity = { studentName: null as string | null, studentNumber: null as string | null };
    if (verification.verificationRequestId) {
      try {
        const result = await getInPersonVerificationDetails(verification.verificationRequestId);
        if (result.servicePointId === verification.servicePointId || !result.servicePointId) {
          identity = studentIdentity(result.attributes, result.isVerified);
        }
      } catch {
        // Identity is intentionally best-effort and expires at the agent.
      }
    }
    const failureCode = verification.failureCode;
    return {
      eventId: verification.eventId ?? verification.id,
      verificationId: verification.id,
      branchId: verification.branchId,
      branchName: verification.branch?.name ?? verification.servicePointName ?? "Branch",
      status: verification.status,
      failureCode,
      failureReason: failureCode ? FAILURE_REASONS[failureCode] ?? "Verification failed." : null,
      completedAt: verification.completedAt!.toISOString(),
      ...identity,
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
