import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  agent: vi.fn(),
  email: vi.fn(),
  lifecycle: vi.fn(),
}));
vi.mock("@/lib/config/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    BATCH_ISSUANCE_PROCESSING_CONCURRENCY: 4,
    ACTIVATION_PUBLIC_BASE_URL: "https://portal.example.invalid",
  },
}));
vi.mock("@/lib/agentClient", () => ({
  createBatchActivationLinks: mocks.agent,
  changeCredentialLifecycle: mocks.lifecycle,
}));
vi.mock("@/lib/email/credential-activation", () => ({
  sendCredentialActivationEmail: mocks.email,
}));
import { prisma } from "@/lib/db/prisma";
import {
  prepareOffer,
  deliverPreparedOffer,
} from "@/lib/credentials/preparedOffer";
import {
  saveValidityPolicy,
  previewPolicyChange,
} from "@/lib/credentials/validityPolicy";
import {
  claimAnnualRenewal,
  processAnnualRenewal,
  runAnnualRenewals,
  cancelRenewalEnrolment,
  retryAnnualRenewal,
} from "@/lib/credentials/annualRenewals";
import { reconcileRenewalActivation } from "@/lib/credentials/renewalActivation";
import {
  renewalOverview,
  studentRenewalEnrolment,
} from "@/lib/credentials/renewalOverview";
import { getStudentById } from "@/lib/students/repository";
import type { StudentRecord } from "@/lib/api/types";

const policy = { startMonth: 2, startDay: 1, expiryMonth: 11, expiryDay: 30 };
const initial = new Date("2026-01-10T10:00:00Z");
let student: StudentRecord;
let priorSchemas: { id: string; isActive: boolean }[] = [];
beforeAll(async () => {
  const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
  if (
    database.pathname !== "/unify_wallet_test" ||
    !["127.0.0.1", "localhost"].includes(database.hostname) ||
    process.env.NODE_ENV === "production"
  )
    throw new Error("Requires isolated local test database.");
  const profile =
    (await prisma.universityProfile.findFirst()) ??
    (await prisma.universityProfile.create({
      data: {
        name: "Test University",
        abbreviation: "TEST",
        contactEmail: "test@example.invalid",
      },
    }));
  priorSchemas = await prisma.credentialSchema.findMany({
    where: { universityProfileId: profile.id },
    select: { id: true, isActive: true },
  });
  await prisma.credentialSchema.updateMany({
    where: { universityProfileId: profile.id },
    data: { isActive: false },
  });
  await prisma.credentialSchema.upsert({
    where: { id: "annual-test-schema" },
    create: {
      id: "annual-test-schema",
      universityProfileId: profile.id,
      schemaName: "AnnualTest",
      schemaVersion: "1.0",
      credentialDefinitionId: "annual-test-definition",
      schemaAttributes: ["studentNumber", "validFrom", "expiresAt"],
    },
    update: { isActive: true },
  });
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(initial);
  await prisma.credentialOfferAttempt.deleteMany();
  await prisma.credentialRenewalRecord.deleteMany();
  await prisma.credentialRenewalEnrolment.deleteMany();
  await prisma.credentialValidityPolicy.deleteMany();
  await prisma.credentialAutomationJob.deleteMany();
  mocks.agent.mockReset();
  mocks.email.mockReset();
  mocks.lifecycle.mockReset();
  mocks.lifecycle.mockImplementation(async (exchangeId: string) => {
    const issuance = await prisma.credentialIssuance.findUniqueOrThrow({
      where: { credentialExchangeId: exchangeId },
    });
    return {
      credentialExchangeId: exchangeId,
      credentialRevocationId: issuance.credentialRevocationId,
      revocationRegistryDefinitionId: issuance.revocationRegistryDefinitionId,
      status: "REVOKED",
      previousStatus: "ACTIVE",
      eventId: randomUUID(),
      revision: 1,
      updatedAt: new Date().toISOString(),
    };
  });
  // Simulate the agent's stable idempotency boundary without changing ledger state.
  const offers = new Map<string, object>();
  mocks.agent.mockImplementation(
    async (payload: {
      students: { idempotencyKey: string; email: string; externalId: string }[];
    }) => ({
      failures: [],
      offers: payload.students.map((item) => {
        let offer = offers.get(item.idempotencyKey);
        if (!offer) {
          offer = {
            activationId: randomUUID(),
            activationUrl: "unifywallet://activate?token=test",
            credentialExchangeId: randomUUID(),
            credentialRevocationId: randomUUID(),
            revocationRegistryDefinitionId: "test-registry",
            email: item.email,
            externalId: item.externalId,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          };
          offers.set(item.idempotencyKey, offer);
        }
        return offer;
      }),
    }),
  );
  mocks.email.mockResolvedValue(undefined);
  await saveValidityPolicy(policy, "test-admin");
  const id = randomUUID();
  await prisma.student.create({
    data: {
      id,
      studentNumber: `ANNUAL-${id}`,
      email: "student@example.invalid",
      firstName: "Annual",
      lastName: "Test",
    },
  });
  student = (await getStudentById(id))!;
});
afterAll(async () => {
  vi.useRealTimers();
  await prisma.credentialSchema.update({
    where: { id: "annual-test-schema" },
    data: { isActive: false },
  });
  for (const schema of priorSchemas)
    await prisma.credentialSchema.update({
      where: { id: schema.id },
      data: { isActive: schema.isActive },
    });
  await prisma.$disconnect();
});
async function enrol(years = 3) {
  const attempt = await prepareOffer({
    key: `initial:${student.profile.id}`,
    student,
    now: initial,
    options: { autoRenew: true, renewalYears: years },
    actorId: "test-admin",
  });
  const issuance = await deliverPreparedOffer(attempt);
  const enrolment = await prisma.credentialRenewalEnrolment.findFirstOrThrow({
    where: { studentId: student.credential.studentNumber },
  });
  return { attempt, issuance, enrolment };
}
async function activate(id: string, issuedAt = new Date()) {
  await prisma.credentialIssuance.update({
    where: { id },
    data: { status: "ISSUED", lifecycleStatus: "ACTIVE", issuedAt },
  });
  await reconcileRenewalActivation(id);
}
it("freezes a January offer and creates exactly two subsequent renewal years", async () => {
  const { attempt, issuance, enrolment } = await enrol();
  expect(attempt.validFrom).toEqual(initial);
  expect(attempt.expiresAt).toEqual(new Date("2026-11-30T22:00:00Z"));
  expect(enrolment.finalYear).toBe(2028);
  expect(
    await prisma.credentialRenewalRecord.count({
      where: { enrolmentId: enrolment.id },
    }),
  ).toBe(3);
  await activate(issuance.id, initial);
  vi.setSystemTime(new Date("2026-02-01T00:00:00+02:00"));
  expect(await claimAnnualRenewal(new Date())).toBeUndefined();
  for (const year of [2027, 2028]) {
    vi.setSystemTime(new Date(`${year}-02-01T00:05:00+02:00`));
    const job = (await claimAnnualRenewal(new Date()))!;
    expect(await processAnnualRenewal(job, new Date())).toBe("succeeded");
    const record = await prisma.credentialRenewalRecord.findUniqueOrThrow({
      where: { id: job.id },
    });
    await activate(record.replacementIssuanceId!);
  }
  expect(mocks.agent).toHaveBeenCalledTimes(3);
  vi.setSystemTime(new Date("2029-02-01T00:05:00+02:00"));
  expect(await claimAnnualRenewal(new Date())).toBeUndefined();
});
it("offers late automatic renewal with the shared start date", async () => {
  await enrol();
  vi.setSystemTime(new Date("2027-02-05T10:00:00Z"));
  const job = (await claimAnnualRenewal(new Date()))!;
  await processAnnualRenewal(job, new Date());
  const attempt = await prisma.credentialOfferAttempt.findFirstOrThrow({
    where: { renewalId: job.id },
  });
  expect(attempt.validFrom.toISOString()).toBe("2027-01-31T22:00:00.000Z");
});
it("changes upcoming dates while keeping prepared attributes immutable", async () => {
  const { attempt } = await enrol();
  await saveValidityPolicy(
    { ...policy, startMonth: 3, expiryMonth: 12, expiryDay: 15 },
    "test-admin",
  );
  const frozen = await prepareOffer({
    key: attempt.key,
    student,
    now: new Date(),
    options: { autoRenew: true, renewalYears: 99 },
  });
  expect(frozen.payload).toEqual(attempt.payload);
  const future = await prisma.credentialRenewalRecord.findFirstOrThrow({
    where: { academicYear: 2027 },
  });
  expect(future.dueAt.toISOString()).toBe("2027-02-28T22:00:00.000Z");
  expect(future.expiresAt.toISOString()).toBe("2027-12-15T22:00:00.000Z");
});
it("claims each annual job once across overlapping workers", async () => {
  await enrol();
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  const claims = await Promise.all(
    Array.from({ length: 12 }, () => claimAnnualRenewal(new Date())),
  );
  expect(claims.filter(Boolean)).toHaveLength(1);
});
it("recovers an interrupted job after its lease expires", async () => {
  await enrol();
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  const first = (await claimAnnualRenewal(new Date()))!;
  vi.setSystemTime(new Date("2027-02-01T10:11:00Z"));
  const second = (await claimAnnualRenewal(new Date()))!;
  expect(second.id).toBe(first.id);
  expect(second.leaseToken).not.toBe(first.leaseToken);
  expect(await processAnnualRenewal(second, new Date())).toBe("succeeded");
});
it("resumes an interrupted agent response with exactly the same attributes and key", async () => {
  await enrol();
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  const job = (await claimAnnualRenewal(new Date()))!;
  const attempt = await prepareOffer({
    key: `annual-renewal:${job.id}:1`,
    student,
    now: new Date(),
    renewalId: job.id,
    automatic: true,
  });
  // Response exists at the agent, but portal persistence was interrupted.
  await mocks.agent(attempt.payload);
  await saveValidityPolicy({ ...policy, expiryDay: 15 }, "test-admin");
  await processAnnualRenewal(job, new Date());
  expect(mocks.agent.mock.calls.at(-1)![0]).toMatchObject({
    students: (attempt.payload as { students: unknown[] }).students,
  });
  expect(
    await prisma.credentialOfferAttempt.count({ where: { renewalId: job.id } }),
  ).toBe(1);
});
it("retries email delivery without creating another offer", async () => {
  await enrol();
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  const first = (await claimAnnualRenewal(new Date()))!;
  mocks.email.mockRejectedValueOnce(new Error("Temporary email outage"));
  expect(await processAnnualRenewal(first, new Date())).toBe("retrying");
  expect(await claimAnnualRenewal(new Date())).toBeUndefined();
  vi.setSystemTime(new Date("2027-02-01T11:01:00Z"));
  const second = (await claimAnnualRenewal(new Date()))!;
  expect(await processAnnualRenewal(second, new Date())).toBe("succeeded");
  expect(mocks.agent).toHaveBeenCalledTimes(2); // Initial issuance plus the annual offer.
});
it("cancels future work while preserving prepared offers", async () => {
  const { attempt, enrolment } = await enrol();
  await cancelRenewalEnrolment(enrolment.id, "test-admin");
  expect(
    await prisma.credentialRenewalRecord.count({
      where: { enrolmentId: enrolment.id, status: "CANCELLED" },
    }),
  ).toBe(2);
  expect(
    (await prepareOffer({ key: attempt.key, student, now: initial })).id,
  ).toBe(attempt.id);
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  expect(await claimAnnualRenewal(new Date())).toBeUndefined();
});
it("does not prepare an offer after cancellation wins the race", async () => {
  const { enrolment } = await enrol();
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  const job = (await claimAnnualRenewal(new Date()))!;
  await cancelRenewalEnrolment(enrolment.id, "test-admin");
  expect(await processAnnualRenewal(job, new Date())).toBe("cancelled");
  expect(
    await prisma.credentialOfferAttempt.count({ where: { renewalId: job.id } }),
  ).toBe(0);
});
it("defers suspension without extending the allowance, then catches up", async () => {
  const { issuance, enrolment } = await enrol();
  await activate(issuance.id, initial);
  await prisma.credentialIssuance.update({
    where: { id: issuance.id },
    data: { lifecycleStatus: "SUSPENDED" },
  });
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  expect(
    await processAnnualRenewal(
      (await claimAnnualRenewal(new Date()))!,
      new Date(),
    ),
  ).toBe("deferred");
  expect(
    (
      await prisma.credentialRenewalEnrolment.findUniqueOrThrow({
        where: { id: enrolment.id },
      })
    ).finalYear,
  ).toBe(2028);
  await prisma.credentialIssuance.update({
    where: { id: issuance.id },
    data: { lifecycleStatus: "ACTIVE" },
  });
  vi.setSystemTime(new Date("2027-02-01T11:01:00Z"));
  expect(
    await processAnnualRenewal(
      (await claimAnnualRenewal(new Date()))!,
      new Date(),
    ),
  ).toBe("succeeded");
});
it("continues after an unaccepted year and revokes the original when a later offer activates", async () => {
  const { issuance } = await enrol();
  await activate(issuance.id, initial);
  for (const year of [2027, 2028]) {
    vi.setSystemTime(new Date(`${year}-02-01T10:00:00Z`));
    const job = (await claimAnnualRenewal(new Date()))!;
    await processAnnualRenewal(job, new Date());
    if (year === 2028) {
      const record = await prisma.credentialRenewalRecord.findUniqueOrThrow({
        where: { id: job.id },
      });
      await activate(record.replacementIssuanceId!);
      expect(
        await prisma.credentialAutomationJob.count({
          where: { credentialIssuanceId: issuance.id, type: "REVOKE_REPLACED" },
        }),
      ).toBe(1);
    }
  }
});
it("skips fully elapsed years without extending the final year", async () => {
  const { enrolment } = await enrol();
  vi.setSystemTime(new Date("2028-02-05T10:00:00Z"));
  await runAnnualRenewals(new Date(), Date.now() + 30000);
  const records = await prisma.credentialRenewalRecord.findMany({
    where: { enrolmentId: enrolment.id },
    orderBy: { academicYear: "asc" },
  });
  expect(records[1].status).toBe("SKIPPED");
  expect(records[2].status).toBe("AWAITING_ACTIVATION");
});
it("discovers work beyond fifty older exhausted failures", async () => {
  const { enrolment } = await enrol();
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  const baseline = await prisma.credentialRenewalRecord.findFirstOrThrow({
    where: { enrolmentId: enrolment.id, academicYear: 2027 },
  });
  for (let index = 0; index < 55; index++) {
    const other = await prisma.credentialRenewalEnrolment.create({
      data: {
        studentId: `failed-${index}`,
        initialYear: 2026,
        finalYear: 2027,
      },
    });
    await prisma.credentialRenewalRecord.create({
      data: {
        enrolmentId: other.id,
        academicYear: 2027,
        dueAt: new Date("2027-01-01"),
        expiresAt: baseline.expiresAt,
        status: "FAILED",
        attemptCount: 5,
      },
    });
  }
  expect((await claimAnnualRenewal(new Date()))!.id).toBe(baseline.id);
});
it("stops renewing permanently revoked credentials", async () => {
  const { issuance, enrolment } = await enrol();
  await activate(issuance.id, initial);
  await prisma.credentialIssuance.update({
    where: { id: issuance.id },
    data: { lifecycleStatus: "REVOKED", status: "REVOKED" },
  });
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  expect(
    await processAnnualRenewal(
      (await claimAnnualRenewal(new Date()))!,
      new Date(),
    ),
  ).toBe("cancelled");
  expect(
    (
      await prisma.credentialRenewalEnrolment.findUniqueOrThrow({
        where: { id: enrolment.id },
      })
    ).status,
  ).toBe("CANCELLED");
});

it("prevents a reclaimed worker from preparing or delivering another offer", async () => {
  await enrol();
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  const stale = (await claimAnnualRenewal(new Date()))!;
  vi.setSystemTime(new Date("2027-02-01T10:11:00Z"));
  const current = (await claimAnnualRenewal(new Date()))!;
  expect(await processAnnualRenewal(stale, new Date())).toBe("deferred");
  expect(
    await prisma.credentialOfferAttempt.count({
      where: { renewalId: stale.id },
    }),
  ).toBe(0);
  expect(await processAnnualRenewal(current, new Date())).toBe("succeeded");
});
it("does not renew early when policy changes after a worker claims a job", async () => {
  await enrol();
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  const job = (await claimAnnualRenewal(new Date()))!;
  await saveValidityPolicy({ ...policy, startMonth: 3 }, "test-admin");
  expect(await processAnnualRenewal(job, new Date())).toBe("deferred");
  expect(await claimAnnualRenewal(new Date())).toBeUndefined();
  expect(
    await prisma.credentialOfferAttempt.count({ where: { renewalId: job.id } }),
  ).toBe(0);
});
it("marks exhausted failures for manual recovery and preserves retry deadlines", async () => {
  await enrol();
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  mocks.agent.mockRejectedValue(new Error("Agent unavailable"));
  for (let attempt = 1; attempt <= 5; attempt++) {
    const job = (await claimAnnualRenewal(new Date()))!;
    expect(await processAnnualRenewal(job, new Date())).toBe(
      attempt === 5 ? "failed" : "retrying",
    );
    expect(await claimAnnualRenewal(new Date())).toBeUndefined();
    vi.setSystemTime(new Date(Date.now() + 3600001));
  }
  expect(await claimAnnualRenewal(new Date())).toBeUndefined();
  expect(
    await prisma.credentialRenewalRecord.count({
      where: { status: "FAILED", attemptCount: 5 },
    }),
  ).toBe(1);
});
it("processes a successful backlog larger than fifty jobs", async () => {
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  const ids = Array.from({ length: 60 }, () => randomUUID());
  await prisma.student.createMany({
    data: ids.map((id) => ({
      id,
      studentNumber: `BULK-${id}`,
      email: "bulk@example.invalid",
      firstName: "Bulk",
      lastName: "Test",
    })),
  });
  for (const id of ids)
    await prisma.credentialRenewalEnrolment.create({
      data: {
        studentId: `BULK-${id}`,
        initialYear: 2026,
        finalYear: 2027,
        records: {
          create: {
            academicYear: 2027,
            dueAt: new Date("2027-01-31T22:00:00Z"),
            expiresAt: new Date("2027-11-30T22:00:00Z"),
          },
        },
      },
    });
  expect(await runAnnualRenewals(new Date(), Date.now() + 30000)).toMatchObject(
    { processed: 60, succeeded: 60 },
  );
  expect(mocks.agent).toHaveBeenCalledTimes(60);
  const firstPage = await renewalOverview({ view: "history" });
  expect(firstPage.total).toBe(60);
  expect(firstPage.records).toHaveLength(25);
  expect(
    (await renewalOverview({ view: "history", page: "3" })).records,
  ).toHaveLength(10);
});

it("recovers an expired activation offer with a new identity and revokes the old offer", async () => {
  const { attempt, issuance, enrolment } = await enrol();
  vi.setSystemTime(new Date("2026-01-12T10:00:00Z"));
  await runAnnualRenewals(new Date(), Date.now() + 10000);
  const record = await prisma.credentialRenewalRecord.findUniqueOrThrow({
    where: { id: attempt.renewalId! },
  });
  expect(record.status).toBe("NEEDS_ATTENTION");
  expect(mocks.agent).toHaveBeenCalledTimes(1);
  await expect(retryAnnualRenewal(record.id, "test-admin")).rejects.toThrow(
    "replacement offer",
  );
  await saveValidityPolicy({ ...policy, expiryMonth: 12 }, "test-admin");
  await retryAnnualRenewal(record.id, "test-admin", true);
  const replacement = await prisma.credentialRenewalRecord.findUniqueOrThrow({
    where: { id: record.id },
  });
  expect(replacement.activeAttemptId).not.toBe(attempt.id);
  expect(replacement.deliveredAt).toBeNull();
  expect(
    (
      await prisma.credentialIssuance.findUniqueOrThrow({
        where: { id: issuance.id },
      })
    ).status,
  ).toBe("REVOKED");
  expect(mocks.lifecycle).toHaveBeenCalledTimes(1);
  expect(
    await processAnnualRenewal(
      (await claimAnnualRenewal(new Date()))!,
      new Date(),
    ),
  ).toBe("succeeded");
  expect(mocks.agent).toHaveBeenCalledTimes(2);
  const newAttempt = await prisma.credentialOfferAttempt.findUniqueOrThrow({
    where: { id: replacement.activeAttemptId! },
  });
  expect(newAttempt.expiresAt).toEqual(new Date("2026-12-30T22:00:00Z"));
  expect(newAttempt.validFrom).toEqual(new Date());
  expect(
    (
      await prisma.credentialRenewalEnrolment.findUniqueOrThrow({
        where: { id: enrolment.id },
      })
    ).finalYear,
  ).toBe(2028);
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  expect(
    await processAnnualRenewal(
      (await claimAnnualRenewal(new Date()))!,
      new Date(),
    ),
  ).toBe("succeeded");
});
it("retries failed delivery manually without changing its frozen offer", async () => {
  await enrol();
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  mocks.email.mockRejectedValue(new Error("Mail unavailable"));
  const job = (await claimAnnualRenewal(new Date()))!;
  await processAnnualRenewal(job, new Date());
  await prisma.credentialRenewalRecord.update({
    where: { id: job.id },
    data: { status: "FAILED", attemptCount: 5 },
  });
  await expect(retryAnnualRenewal(job.id, "test-admin", true)).rejects.toThrow(
    "expired activation",
  );
  await retryAnnualRenewal(job.id, "test-admin");
  mocks.email.mockResolvedValue(undefined);
  expect(
    await processAnnualRenewal(
      (await claimAnnualRenewal(new Date()))!,
      new Date(),
    ),
  ).toBe("succeeded");
  expect(mocks.agent).toHaveBeenCalledTimes(2);
  expect(
    await prisma.credentialOfferAttempt.count({ where: { renewalId: job.id } }),
  ).toBe(1);
});
it("serializes simultaneous preparations for one period", async () => {
  await enrol();
  vi.setSystemTime(new Date("2027-02-01T10:00:00Z"));
  const job = (await claimAnnualRenewal(new Date()))!;
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, index) =>
      prepareOffer({
        key: `competing:${index}`,
        student,
        now: new Date(),
        renewalId: job.id,
        automatic: true,
      }),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    await prisma.credentialOfferAttempt.count({ where: { renewalId: job.id } }),
  ).toBe(1);
});

it("shows suspension from the activated credential and retains cancellation history", async () => {
  const { issuance, enrolment } = await enrol();
  await activate(issuance.id, initial);
  await prisma.credentialIssuance.update({
    where: { id: issuance.id },
    data: { lifecycleStatus: "SUSPENDED" },
  });
  const overview = await renewalOverview({
    student: student.credential.studentNumber,
  });
  expect(overview.records).toHaveLength(2);
  expect(overview.records.every((record) => record.suspended)).toBe(true);
  expect(
    (
      await renewalOverview({
        view: "history",
        student: student.credential.studentNumber,
      })
    ).records[0].attempts[0].issuance?.deliveryStatus,
  ).toBe("DELIVERED");
  await cancelRenewalEnrolment(enrolment.id, "test-admin");
  const details = await studentRenewalEnrolment([
    student.credential.studentNumber,
  ]);
  expect(details?.cancellations).toEqual([
    expect.objectContaining({
      id: enrolment.id,
      cancelledBy: "test-admin",
      finalYear: 2028,
    }),
  ]);
});

it("previews newly overdue dates without changing prepared offers", async () => {
  const { attempt } = await enrol();
  vi.setSystemTime(new Date("2027-01-15T10:00:00Z"));
  const changed = { ...policy, startMonth: 1 };
  const preview = await previewPolicyChange(changed, new Date());
  expect(preview.affected).toBe(2);
  expect(preview.overdue).toBe(1);
  expect(preview.changes).toContainEqual(
    expect.objectContaining({
      academicYear: 2027,
      oldStart: "2027-01-31T22:00:00.000Z",
      newStart: "2026-12-31T22:00:00.000Z",
    }),
  );
  await saveValidityPolicy(changed, "test-admin");
  const job = (await claimAnnualRenewal(new Date()))!;
  expect(job.academicYear).toBe(2027);
  await processAnnualRenewal(job, new Date());
  expect(await claimAnnualRenewal(new Date())).toBeUndefined();
  expect(
    (
      await prisma.credentialOfferAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      })
    ).validFrom,
  ).toEqual(initial);
});

it("summarizes operations without student rows and supports academic-year and attention drill-downs", async () => {
  const { enrolment } = await enrol();
  const summary = await renewalOverview({ view: "summary" });
  expect(summary.records).toEqual([]);
  expect(summary.counts.SCHEDULED).toBe(2);
  expect(summary.periods).toEqual([
    expect.objectContaining({
      academicYear: 2027,
      count: 1,
      status: "SCHEDULED",
    }),
    expect.objectContaining({
      academicYear: 2028,
      count: 1,
      status: "SCHEDULED",
    }),
  ]);
  const queue = await renewalOverview({ view: "upcoming", year: "2027" });
  expect(queue.total).toBe(1);
  expect(queue.records[0].academicYear).toBe(2027);
  await prisma.credentialRenewalRecord.updateMany({
    where: { enrolmentId: enrolment.id, academicYear: 2027 },
    data: { status: "FAILED" },
  });
  await prisma.credentialRenewalRecord.updateMany({
    where: { enrolmentId: enrolment.id, academicYear: 2028 },
    data: { status: "NEEDS_ATTENTION" },
  });
  const attention = await renewalOverview({ view: "attention" });
  expect(attention.total).toBe(2);
  expect(attention.records.map((record) => record.status)).toEqual(
    expect.arrayContaining(["FAILED", "NEEDS_ATTENTION"]),
  );
  await expect(renewalOverview({ year: "invalid" })).rejects.toThrow(
    "four-digit year",
  );
});
