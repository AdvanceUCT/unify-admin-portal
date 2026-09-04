import "server-only";

import { CredentialIssuanceStatus, CredentialLifecycleStatus } from "@/generated/prisma/enums";
import { nextRenewalAt, renewalCandidateCutoff } from "@/lib/credentials/renewalCadence";
import { prisma } from "@/lib/db/prisma";

export async function countCredentialsDueForRenewal(cadenceMonths: number, now = new Date()) {
  const candidates = await prisma.credentialIssuance.findMany({
    select: { issuedAt: true },
    where: {
      issuedAt: { lte: renewalCandidateCutoff(now, cadenceMonths) },
      lifecycleStatus: { in: [CredentialLifecycleStatus.ACTIVE, CredentialLifecycleStatus.EXPIRED] },
      renewedIntoIssuanceId: null,
      status: CredentialIssuanceStatus.ISSUED,
    },
  });
  return candidates.filter((issuance) =>
    issuance.issuedAt && nextRenewalAt(issuance.issuedAt, cadenceMonths) <= now,
  ).length;
}
