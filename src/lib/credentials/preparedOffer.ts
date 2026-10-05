import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, CredentialOfferAttempt } from "@/generated/prisma/client";
import { createBatchActivationLinks } from "@/lib/agentClient";
import {
  attributesForStudent,
  getActiveCredentialDefinition,
} from "@/lib/issuance/batchIssuance";
import { getStudentById } from "@/lib/students/repository";
import { toPublicWalletActivationLink } from "@/lib/api/activationLinks";
import {
  createCredentialIssuanceFromOffer,
  reconcileCredentialEventLogs,
} from "./status";
import { sendCredentialActivationEmail } from "@/lib/email/credential-activation";
import {
  academicPeriod,
  issuancePeriod,
  parseRenewalOptions,
  type RenewalOptions,
} from "./academicPeriod";
import type { StudentRecord } from "@/lib/api/types";

export class RenewalNotDueError extends Error {
  constructor(
    public dueAt: Date,
    public expiresAt: Date,
  ) {
    super("The changed policy schedules this renewal in the future.");
  }
}
export class RenewalCancelledError extends Error {}
export class RenewalLeaseLostError extends Error {}
export class RenewalAlreadyPreparedError extends Error {}

type Payload = Parameters<typeof createBatchActivationLinks>[0] & {
  schemaVersion?: string;
};

export async function prepareOffer(input: {
  key: string;
  student: StudentRecord;
  now: Date;
  options?: RenewalOptions;
  renewalId?: string;
  automatic?: boolean;
  recovery?: boolean;
  supersedesIssuanceId?: string;
  actorId?: string | null;
}) {
  const existing = await prisma.credentialOfferAttempt.findUnique({
    where: { key: input.key },
  });
  if (existing) return existing;
  const options = parseRenewalOptions(input.options);
  const schema = await getActiveCredentialDefinition();
  if (
    !schema.schemaAttributes.includes("validFrom") ||
    !schema.schemaAttributes.includes("expiresAt")
  )
    throw new Error(
      "The active schema must include validFrom and expiresAt. Publish a modern schema before issuance.",
    );
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(207206)`;
    const replay = await tx.credentialOfferAttempt.findUnique({
      where: { key: input.key },
    });
    if (replay) return replay;
    const policy = await tx.credentialValidityPolicy.findFirst({
      orderBy: { version: "desc" },
    });
    if (!policy)
      throw new Error(
        "Configure the annual credential validity period in Settings before issuing credentials.",
      );
    let renewal = input.renewalId
      ? await tx.credentialRenewalRecord.findUniqueOrThrow({
          where: { id: input.renewalId },
          include: { enrolment: true },
        })
      : null;
    if (renewal && renewal.enrolment.status !== "ACTIVE" && !input.recovery)
      throw new RenewalCancelledError(
        "Auto-renewal was cancelled before this offer was prepared.",
      );
    if (renewal?.preparedAt && !input.recovery)
      throw new RenewalAlreadyPreparedError(
        "A replacement is already prepared for this academic year.",
      );
    if (
      input.recovery &&
      renewal &&
      !["FAILED", "NEEDS_ATTENTION"].includes(renewal.status)
    )
      throw new Error("Renewal recovery is already running.");
    const period = renewal
      ? academicPeriod(policy, renewal.academicYear)
      : issuancePeriod(policy, input.now);
    if (input.automatic && period.start > input.now)
      throw new RenewalNotDueError(period.start, period.expiresAt);
    if (period.expiresAt <= input.now)
      throw new Error("The target academic period has already expired.");
    const validFrom = input.automatic ? period.start : input.now;
    if (!renewal && options.autoRenew) {
      const active = await tx.credentialRenewalEnrolment.findFirst({
        where: {
          studentId: input.student.credential.studentNumber,
          status: "ACTIVE",
        },
      });
      if (active)
        throw new Error(
          "An active renewal enrolment already exists; its final academic year cannot be restarted.",
        );
      const enrolment = await tx.credentialRenewalEnrolment.create({
        data: {
          studentId: input.student.credential.studentNumber,
          initialYear: period.academicYear,
          finalYear: period.academicYear + options.renewalYears! - 1,
        },
      });
      for (
        let year = period.academicYear;
        year <= enrolment.finalYear;
        year++
      ) {
        const dates = academicPeriod(policy, year);
        const record = await tx.credentialRenewalRecord.create({
          data: {
            enrolmentId: enrolment.id,
            academicYear: year,
            dueAt: dates.start,
            expiresAt: dates.expiresAt,
            status: year === period.academicYear ? "PROCESSING" : "SCHEDULED",
          },
        });
        if (year === period.academicYear) renewal = { ...record, enrolment };
      }
    }
    const payload: Payload = {
      credentialDefinitionId: schema.credentialDefinitionId,
      ...(schema.revocationRegistryDefinitionId
        ? {
            revocationRegistryDefinitionId:
              schema.revocationRegistryDefinitionId,
          }
        : {}),
      schemaVersion: schema.schemaVersion ?? undefined,
      students: [
        {
          externalId: input.student.profile.id,
          email: input.student.profile.email,
          idempotencyKey: input.key,
          attributes: attributesForStudent(
            input.student,
            schema.schemaAttributes,
            { validFrom, expiresAt: period.expiresAt },
          ),
        },
      ],
    };
    const attempt = await tx.credentialOfferAttempt.create({
      data: {
        key: input.key,
        automatic: Boolean(input.automatic),
        studentId: input.student.credential.studentNumber,
        policyId: policy.id,
        academicYear: period.academicYear,
        validFrom,
        expiresAt: period.expiresAt,
        payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
        renewalId: renewal?.id,
        supersedesIssuanceId: input.supersedesIssuanceId,
        actorId: input.actorId,
      },
    });
    if (renewal)
      await tx.credentialRenewalRecord.update({
        where: { id: renewal.id },
        data: {
          preparedAt: input.now,
          activeAttemptId: attempt.id,
          dueAt: period.start,
          expiresAt: period.expiresAt,
          ...(input.recovery
            ? {
                status: "RETRYING",
                retryAt: input.now,
                attemptCount: 0,
                lastError: null,
                replacementIssuanceId: null,
                deliveredAt: null,
                activatedAt: null,
                leaseToken: null,
                leaseExpiresAt: null,
              }
            : {}),
          ...(input.automatic || input.recovery
            ? {}
            : {
                status: "PROCESSING",
                leaseExpiresAt: new Date(input.now.getTime() + 600_000),
              }),
        },
      });
    return attempt;
  });
}

/** Resume from persisted offer/issuance; email failures do not recreate the offer. */
export async function deliverPreparedOffer(
  attempt: CredentialOfferAttempt,
  leaseToken?: string | null,
) {
  async function assertLease() {
    if (!attempt.renewalId || !leaseToken) return;
    const record = await prisma.credentialRenewalRecord.findUniqueOrThrow({
      where: { id: attempt.renewalId },
    });
    if (
      record.leaseToken !== leaseToken ||
      !record.leaseExpiresAt ||
      record.leaseExpiresAt <= new Date()
    )
      throw new RenewalLeaseLostError(
        "Renewal processing lease has been reclaimed.",
      );
  }
  await assertLease();
  const payload = attempt.payload as unknown as Payload;
  let issuance = attempt.issuanceId
    ? await prisma.credentialIssuance.findUniqueOrThrow({
        where: { id: attempt.issuanceId },
      })
    : null;
  if (!issuance) {
    const { schemaVersion, ...request } = payload;
    const result = await createBatchActivationLinks(request);
    await assertLease();
    const offer = result.offers[0];
    if (!offer)
      throw new Error(
        result.failures[0]?.message ??
          "Agent did not return a credential offer.",
      );
    issuance = await createCredentialIssuanceFromOffer({
      activationId: offer.activationId,
      activationUrl: toPublicWalletActivationLink(offer.activationUrl),
      credentialDefinitionId: payload.credentialDefinitionId,
      credentialExchangeId: offer.credentialExchangeId,
      credentialValidFrom: attempt.validFrom,
      credentialExpiresAt: attempt.expiresAt,
      credentialRevocationId: offer.credentialRevocationId,
      revocationRegistryDefinitionId: offer.revocationRegistryDefinitionId,
      email: offer.email,
      expiresAt: offer.expiresAt,
      schemaVersion,
      studentId: attempt.studentId,
      renewedFromIssuanceId: attempt.supersedesIssuanceId ?? undefined,
      deliveryStatus: "PENDING",
      wasDelivered: false,
    });
    await prisma.$transaction(async (tx) => {
      await tx.credentialOfferAttempt.update({
        where: { id: attempt.id },
        data: { issuanceId: issuance!.id },
      });
      if (attempt.renewalId) {
        const record = await tx.credentialRenewalRecord.update({
          where: { id: attempt.renewalId },
          data: { replacementIssuanceId: issuance!.id },
        });
        await tx.credentialRenewalEnrolment.updateMany({
          where: { id: record.enrolmentId, originatingIssuanceId: null },
          data: { originatingIssuanceId: issuance!.id },
        });
      }
    });
  }
  if (issuance.credentialExchangeId)
    await reconcileCredentialEventLogs(issuance.credentialExchangeId);
  issuance = await prisma.credentialIssuance.findUniqueOrThrow({
    where: { id: issuance.id },
  });
  if (issuance.deliveryStatus !== "DELIVERED" && issuance.status !== "ISSUED") {
    // Activation may legitimately clear the lease while the same offer is delivering.
    await assertLease();
    if (
      !issuance.activationExpiresAt ||
      issuance.activationExpiresAt <= new Date()
    )
      throw new Error(
        "Activation offer expired. Create an explicit replacement offer.",
      );
    const student = await getStudentById(payload.students[0].externalId!);
    if (!student || !issuance.email || !issuance.activationUrl)
      throw new Error("Student activation delivery details are missing.");
    try {
      await sendCredentialActivationEmail({
        activationUrl: issuance.activationUrl,
        expiresAt: issuance.activationExpiresAt.toISOString(),
        studentName: `${student.profile.firstName} ${student.profile.lastName}`,
        to: issuance.email,
      });
      issuance = await prisma.credentialIssuance.update({
        where: { id: issuance.id },
        data: {
          deliveryStatus: "DELIVERED",
          failureReason: null,
          ...(issuance.status === "FAILED" &&
          issuance.deliveryStatus === "FAILED"
            ? { status: "OFFER_SENT" }
            : {}),
        },
      });
    } catch (error) {
      await prisma.credentialIssuance.update({
        where: { id: issuance.id },
        data: {
          deliveryStatus: "FAILED",
          failureReason:
            error instanceof Error ? error.message : "Email delivery failed.",
        },
      });
      await prisma.credentialIssuance.updateMany({
        where: { id: issuance.id, status: "OFFER_SENT" },
        data: { status: "FAILED" },
      });
      throw error;
    }
    await prisma.credentialAuditLog.createMany({
      data: {
        eventId: `offer-delivered:${attempt.id}`,
        action: "OFFER_SENT",
        actorId: attempt.actorId,
        studentId: attempt.studentId,
        credentialDefinitionId: issuance.credentialDefinitionId,
        credentialExchangeId: issuance.credentialExchangeId,
        credentialIssuanceId: issuance.id,
        deliveryStatus: "DELIVERED",
        message: "Credential activation offer delivered.",
        metadata: {
          academicYear: attempt.academicYear,
          policyId: attempt.policyId,
        },
      },
      skipDuplicates: true,
    });
  }
  issuance = await prisma.credentialIssuance.findUniqueOrThrow({
    where: { id: issuance.id },
  });
  if (attempt.renewalId)
    await prisma.credentialRenewalRecord.updateMany({
      where: {
        id: attempt.renewalId,
        replacementIssuanceId: issuance.id,
        ...(leaseToken && issuance.status !== "ISSUED" ? { leaseToken } : {}),
      },
      data: {
        ...(issuance.deliveryStatus === "DELIVERED"
          ? { deliveredAt: new Date() }
          : {}),
        status:
          issuance.status === "ISSUED" ? "ACTIVATED" : "AWAITING_ACTIVATION",
        ...(issuance.status === "ISSUED"
          ? { activatedAt: issuance.issuedAt }
          : {}),
        lastError: null,
        leaseExpiresAt: null,
        leaseToken: null,
      },
    });
  return issuance;
}
