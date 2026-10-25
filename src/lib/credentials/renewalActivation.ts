import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * Mark an observed issued replacement activated and find the newest activated offer in its enrolment.
 * Queue deduplicated revocation of older issued credentials, including when intermediate activation events were missed.
 */
export async function reconcileRenewalActivation(issuanceId: string) {
  const attempt = await prisma.credentialOfferAttempt.findUnique({
    where: { issuanceId },
    include: { renewal: true },
  });
  if (!attempt?.renewal) return;
  const issuance = await prisma.credentialIssuance.findUniqueOrThrow({
    where: { id: issuanceId },
  });
  if (issuance.status !== "ISSUED") return;
  await prisma.credentialRenewalRecord.updateMany({
    where: { id: attempt.renewal.id, replacementIssuanceId: issuanceId },
    data: {
      status: "ACTIVATED",
      activatedAt: issuance.issuedAt,
      leaseExpiresAt: null,
      leaseToken: null,
      lastError: null,
    },
  });
  const attempts = await prisma.credentialOfferAttempt.findMany({
    where: {
      renewal: { enrolmentId: attempt.renewal.enrolmentId },
      issuanceId: { not: null },
    },
    orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
  });
  const issued = await prisma.credentialIssuance.findMany({
    where: {
      id: { in: attempts.map((item) => item.issuanceId!) },
      status: "ISSUED",
    },
  });
  const activated = attempts.filter((item) =>
    issued.some((credential) => credential.id === item.issuanceId),
  );
  const winner = activated[0];
  if (!winner) return;
  for (const old of activated.slice(1)) {
    const credential = issued.find((item) => item.id === old.issuanceId)!;
    if (
      credential.lifecycleStatus === "REVOKED" ||
      !credential.credentialRevocationId ||
      !credential.revocationRegistryDefinitionId
    )
      continue;
    await prisma.credentialAutomationJob.upsert({
      where: {
        deduplicationKey: `revoke-replaced:${credential.id}:${winner.issuanceId}`,
      },
      create: {
        credentialIssuanceId: credential.id,
        deduplicationKey: `revoke-replaced:${credential.id}:${winner.issuanceId}`,
        type: "REVOKE_REPLACED",
        dueAt: new Date(),
        metadata: { replacementIssuanceId: winner.issuanceId },
      },
      update: {},
    });
  }
}
