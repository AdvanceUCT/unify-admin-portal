import { describe, expect, it, vi, beforeEach } from "vitest";
import { createBatchActivationLinks } from "@/lib/agentClient";
import { sendCredentialActivationEmail } from "@/lib/email/credential-activation";
import { resetMockActivationStore } from "@/lib/api/mockActivationStore";
import { recordCredentialOfferSentAudit } from "@/lib/credentials/audit";
import { queueRealBatchIssuance, queueRealStudentIssuance, queueRealStudentRenewal, StudentIssuanceError } from "@/lib/issuance/batchIssuance";
import { assertCredentialIssuanceAllowed, createCredentialIssuanceFromOffer, overlayCredentialStatusForStudent } from "@/lib/credentials/status";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";

const prismaMocks = vi.hoisted(() => ({
  auditCreate: vi.fn(),
  issuanceFindFirst: vi.fn(),
  issuanceFindUnique: vi.fn(),
  issuanceUpdate: vi.fn(),
  issuanceUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/agentClient", () => ({
  createBatchActivationLinks: vi.fn(),
}));

vi.mock("@/lib/email/credential-activation", () => ({
  sendCredentialActivationEmail: vi.fn(),
}));

vi.mock("@/lib/credentials/audit", () => ({
  recordCredentialOfferSentAudit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/credentials/status", () => ({
  assertCredentialIssuanceAllowed: vi.fn(async () => undefined),
  createCredentialIssuanceFromOffer: vi.fn(async (params: { renewedFromIssuanceId?: string; studentId: string }) => ({
    id: params.renewedFromIssuanceId
      ? "credential-renewal-100"
      : params.studentId === "WOOJOS100"
        ? "credential-demo-100"
        : "credential-demo-001",
  })),
  overlayCredentialStatus: vi.fn((student) => ({
    ...student,
    credential: { ...student.credential, lifecycleState: "ACTIVE" },
  })),
  overlayCredentialStatuses: vi.fn(async (students) => students),
  overlayCredentialStatusForStudent: vi.fn(async (student) => student),
  reconcileCredentialEventLogs: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/prisma", () => {
  const transaction = {
    credentialAuditLog: {
      create: prismaMocks.auditCreate,
    },
    credentialIssuance: {
      update: prismaMocks.issuanceUpdate,
    },
  };

  return {
    prisma: {
      $transaction: prismaMocks.transaction.mockImplementation((operation: (client: typeof transaction) => unknown) =>
        operation(transaction),
      ),
      credentialIssuance: {
        findFirst: prismaMocks.issuanceFindFirst,
        findUnique: prismaMocks.issuanceFindUnique,
        update: prismaMocks.issuanceUpdate,
        updateMany: prismaMocks.issuanceUpdateMany,
      },
    },
  };
});

vi.mock("@/lib/university/profile", () => ({
  getUniversityProfile: vi.fn(),
}));

vi.mock("@/lib/students/repository", async () => {
  const { getMockAdminState } = await import("@/lib/api/mockActivationStore");
  return {
    getAllStudents: vi.fn(async () => getMockAdminState().students),
    getStudentById: vi.fn(async (id: string) =>
      getMockAdminState().students.find((student) => student.profile.id === id),
    ),
  };
});

vi.mock("@/lib/university/credentialSchema", () => ({
  getActiveCredentialSchema: vi.fn(),
}));

describe("real batch issuance orchestration", () => {
  beforeEach(() => {
    resetMockActivationStore();
    vi.mocked(createBatchActivationLinks).mockReset();
    vi.mocked(sendCredentialActivationEmail).mockReset();
    vi.mocked(recordCredentialOfferSentAudit).mockReset();
    vi.mocked(recordCredentialOfferSentAudit).mockResolvedValue(undefined);
    vi.mocked(assertCredentialIssuanceAllowed).mockReset();
    vi.mocked(assertCredentialIssuanceAllowed).mockResolvedValue(undefined);
    vi.mocked(createCredentialIssuanceFromOffer).mockReset();
    vi.mocked(createCredentialIssuanceFromOffer).mockImplementation(async (params: { renewedFromIssuanceId?: string; studentId: string }) => ({
      id: params.renewedFromIssuanceId
        ? "credential-renewal-100"
        : params.studentId === "WOOJOS100"
          ? "credential-demo-100"
          : "credential-demo-001",
    }) as never);
    vi.mocked(overlayCredentialStatusForStudent).mockReset();
    vi.mocked(overlayCredentialStatusForStudent).mockImplementation(async (student) => student);
    vi.mocked(getUniversityProfile).mockReset();
    vi.mocked(getUniversityProfile).mockResolvedValue({
      defaultCredentialValidityDays: 365,
      id: "profile-001",
    } as never);
    vi.mocked(getActiveCredentialSchema).mockReset();
    vi.mocked(getActiveCredentialSchema).mockResolvedValue({
      credentialDefinitionId: "cred-def-id",
      schemaAttributes: ["studentNumber", "firstName", "lastName", "faculty", "year"],
      schemaVersion: "1.0",
    } as never);
    prismaMocks.auditCreate.mockReset();
    prismaMocks.issuanceFindFirst.mockReset();
    prismaMocks.issuanceFindUnique.mockReset();
    prismaMocks.issuanceUpdate.mockReset();
    prismaMocks.issuanceUpdateMany.mockReset();
    prismaMocks.issuanceUpdateMany.mockResolvedValue({ count: 1 });
    prismaMocks.transaction.mockClear();
    prismaMocks.transaction.mockImplementation((operation) =>
      operation({
        credentialAuditLog: { create: prismaMocks.auditCreate },
        credentialIssuance: { update: prismaMocks.issuanceUpdate },
      }),
    );
  });

  it("issues Joshua's simulated student credential through the agent service and sends email", async () => {
    vi.mocked(createBatchActivationLinks).mockResolvedValue({
      failures: [],
      offers: [
        {
          activationId: "activation-001",
          activationUrl: "unifywallet://activate?token=real-token",
          credentialExchangeId: "credential-exchange-001",
          email: "joshuawood.dc@gmail.com",
          expiresAt: "2026-04-28T10:00:00.000Z",
          externalId: "student-demo-100",
        },
      ],
    });

    const agentRequest = vi.mocked(createBatchActivationLinks);
    const result = await queueRealBatchIssuance(new Date("2026-04-27T10:00:00Z"));

    expect(agentRequest).toHaveBeenCalledWith({
      credentialDefinitionId: "cred-def-id",
      students: expect.arrayContaining([
        expect.objectContaining({
          email: "joshuawood.dc@gmail.com",
          externalId: "student-demo-100",
        }),
      ]),
    });
    const joshuaRequest = agentRequest.mock.calls[0][0].students.find(
      (student) => student.externalId === "student-demo-100",
    );
    expect(joshuaRequest).toBeDefined();
    expect(joshuaRequest).not.toHaveProperty("walletId");
    expect(joshuaRequest?.attributes).toEqual([
      { name: "studentNumber", value: "WOOJOS100" },
      { name: "firstName", value: "Joshua" },
      { name: "lastName", value: "Wood" },
      { name: "faculty", value: "Health Sciences" },
      { name: "year", value: "2026" },
    ]);
    expect(sendCredentialActivationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        activationUrl: "http://localhost:3000/activate?token=real-token",
        studentName: "Joshua Wood",
        to: "joshuawood.dc@gmail.com",
      }),
    );
    expect(result.activationDeliveries[0]).toMatchObject({
      activationUrl: "http://localhost:3000/activate?token=real-token",
      credentialExchangeId: "credential-exchange-001",
      credentialId: "credential-demo-100",
      email: "joshuawood.dc@gmail.com",
      status: "Delivered",
      studentId: "student-demo-100",
    });
    expect(recordCredentialOfferSentAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialExchangeId: "credential-exchange-001",
        deliveryStatus: "DELIVERED",
        studentId: "WOOJOS100",
      }),
    );
    expect(vi.mocked(recordCredentialOfferSentAudit).mock.calls[0][0]).not.toHaveProperty("email");
  });

  it("issues only Joshua when requested from the student detail action", async () => {
    vi.mocked(createBatchActivationLinks).mockResolvedValue({
      failures: [],
      offers: [
        {
          activationId: "activation-joshua",
          activationUrl: "unifywallet://activate?token=joshua-token",
          credentialExchangeId: "credential-exchange-joshua",
          email: "joshuawood.dc@gmail.com",
          expiresAt: "2026-04-28T10:00:00.000Z",
          externalId: "student-demo-100",
        },
      ],
    });

    const result = await queueRealStudentIssuance("student-demo-100", new Date("2026-04-27T10:00:00Z"));

    expect(createBatchActivationLinks).toHaveBeenCalledWith({
      credentialDefinitionId: "cred-def-id",
      students: [
        expect.objectContaining({
          email: "joshuawood.dc@gmail.com",
          externalId: "student-demo-100",
        }),
      ],
    });
    expect(result.requestedCount).toBe(1);
    expect(result.issuedCredentialIds).toEqual(["credential-demo-100"]);
  });

  it("uses one offer timestamp for validity attributes and DB expiry", async () => {
    vi.mocked(getUniversityProfile).mockResolvedValueOnce({
      defaultCredentialValidityDays: 30,
      id: "profile-001",
    } as never);
    vi.mocked(getActiveCredentialSchema).mockResolvedValueOnce({
      credentialDefinitionId: "cred-def-id",
      schemaAttributes: ["studentNumber", "validFrom", "issuedAt", "expiresAt"],
      schemaVersion: "1.0",
    } as never);
    vi.mocked(createBatchActivationLinks).mockResolvedValue({
      failures: [],
      offers: [
        {
          activationId: "activation-joshua",
          activationUrl: "unifywallet://activate?token=joshua-token",
          credentialExchangeId: "credential-exchange-joshua",
          email: "joshuawood.dc@gmail.com",
          expiresAt: "2026-04-28T10:00:00.000Z",
          externalId: "student-demo-100",
        },
      ],
    });

    await queueRealStudentIssuance("student-demo-100", new Date("2026-04-27T10:00:00.000Z"));

    const studentPayload = vi.mocked(createBatchActivationLinks).mock.calls[0][0].students[0];
    expect(studentPayload.attributes).toEqual([
      { name: "studentNumber", value: "WOOJOS100" },
      { name: "validFrom", value: "2026-04-27T10:00:00.000Z" },
      { name: "issuedAt", value: "2026-04-27T10:00:00.000Z" },
      { name: "expiresAt", value: "2026-05-27T10:00:00.000Z" },
    ]);
    expect(createCredentialIssuanceFromOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialExpiresAt: new Date("2026-05-27T10:00:00.000Z"),
      }),
    );
  });

  it("records an offer audit log when email delivery fails", async () => {
    vi.mocked(createBatchActivationLinks).mockResolvedValue({
      failures: [],
      offers: [
        {
          activationId: "activation-joshua",
          activationUrl: "unifywallet://activate?token=joshua-token",
          credentialExchangeId: "credential-exchange-joshua",
          email: "joshuawood.dc@gmail.com",
          expiresAt: "2026-04-28T10:00:00.000Z",
          externalId: "student-demo-100",
        },
      ],
    });
    vi.mocked(sendCredentialActivationEmail).mockRejectedValueOnce(new Error("Email provider unavailable."));

    const result = await queueRealStudentIssuance("student-demo-100", new Date("2026-04-27T10:00:00Z"));

    expect(result.failures?.[0]).toMatchObject({
      message: "Email provider unavailable.",
    });
    expect(recordCredentialOfferSentAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: null,
        credentialExchangeId: "credential-exchange-joshua",
        deliveryStatus: "FAILED",
        failureReason: "Email provider unavailable.",
        studentId: "WOOJOS100",
      }),
    );
    expect(vi.mocked(recordCredentialOfferSentAudit).mock.calls[0][0]).not.toHaveProperty("email");
  });

  it("does not issue a credential for a student that is no longer in an issuable state", async () => {
    vi.mocked(assertCredentialIssuanceAllowed).mockRejectedValueOnce(
      new Error("Student already has an active credential issuance in status OFFER_SENT."),
    );

    await expect(queueRealStudentIssuance("student-demo-001")).rejects.toMatchObject({
      message: "Student already has an active credential issuance in status OFFER_SENT.",
      status: 409,
    } satisfies Partial<StudentIssuanceError>);
    expect(createBatchActivationLinks).not.toHaveBeenCalled();
  });

  it("creates a replacement offer for renewal without blocking on the existing active issuance", async () => {
    prismaMocks.issuanceFindFirst.mockResolvedValue({
      credentialDefinitionId: "cred-def-id",
      credentialExchangeId: "credential-exchange-old",
      id: "issuance-old",
      studentId: "WOOJOS100",
    });
    vi.mocked(overlayCredentialStatusForStudent).mockImplementationOnce(async (student) => ({
      ...student,
      credential: { ...student.credential, lifecycleState: "ACTIVE" },
    }));
    vi.mocked(createBatchActivationLinks).mockResolvedValue({
      failures: [],
      offers: [
        {
          activationId: "activation-renewal",
          activationUrl: "unifywallet://activate?token=renewal-token",
          credentialExchangeId: "credential-exchange-renewal",
          email: "joshuawood.dc@gmail.com",
          expiresAt: "2026-04-28T10:00:00.000Z",
          externalId: "student-demo-100",
        },
      ],
    });

    const result = await queueRealStudentRenewal("student-demo-100", new Date("2026-04-27T10:00:00Z"), "admin-1");

    expect(assertCredentialIssuanceAllowed).not.toHaveBeenCalled();
    expect(result.activationDeliveries[0]).toMatchObject({
      credentialId: "credential-renewal-100",
      status: "Delivered",
    });
    expect(prismaMocks.issuanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ renewalStatus: "COMPLETED", renewedIntoIssuanceId: "credential-renewal-100" }),
        where: expect.objectContaining({ id: "issuance-old" }),
      }),
    );
    expect(prismaMocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREDENTIAL_RENEWAL_OFFER_CREATED",
          actorId: "admin-1",
        }),
      }),
    );
  });

  it("keeps a renewal retryable when activation email delivery fails", async () => {
    prismaMocks.issuanceFindFirst.mockResolvedValue({
      credentialDefinitionId: "cred-def-id",
      credentialExchangeId: "credential-exchange-old",
      id: "issuance-old",
      studentId: "WOOJOS100",
    });
    vi.mocked(createBatchActivationLinks).mockResolvedValue({
      failures: [],
      offers: [{
        activationId: "activation-renewal",
        activationUrl: "unifywallet://activate?token=renewal-token",
        credentialExchangeId: "credential-exchange-renewal",
        email: "joshuawood.dc@gmail.com",
        expiresAt: "2026-04-28T10:00:00.000Z",
        externalId: "student-demo-100",
      }],
    });
    vi.mocked(sendCredentialActivationEmail).mockRejectedValueOnce(new Error("Email provider unavailable."));

    await expect(
      queueRealStudentRenewal("student-demo-100", new Date("2026-04-27T10:00:00Z"), "admin-1"),
    ).rejects.toThrow("Email provider unavailable.");

    expect(prismaMocks.issuanceUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        renewalFailureReason: "Email provider unavailable.",
        renewalStatus: "FAILED",
      }),
      where: { id: "issuance-old" },
    }));
  });

  it("records a failed renewal reason when the agent activation-link call times out", async () => {
    prismaMocks.issuanceFindFirst.mockResolvedValue({
      credentialDefinitionId: "cred-def-id",
      credentialExchangeId: "credential-exchange-old",
      id: "issuance-old",
      studentId: "WOOJOS100",
    });
    vi.mocked(overlayCredentialStatusForStudent).mockImplementationOnce(async (student) => ({
      ...student,
      credential: { ...student.credential, lifecycleState: "ACTIVE" },
    }));
    vi.mocked(createBatchActivationLinks).mockRejectedValueOnce(
      new Error("Agent service request timed out after 60000ms."),
    );

    await expect(
      queueRealStudentRenewal("student-demo-100", new Date("2026-04-27T10:00:00Z"), "admin-1"),
    ).rejects.toThrow("Agent service request timed out after 60000ms.");

    expect(prismaMocks.issuanceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          renewalFailureReason: null,
          renewalStatus: "PENDING",
        }),
        where: expect.objectContaining({ id: "issuance-old" }),
      }),
    );
    expect(prismaMocks.issuanceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          renewalFailureReason: "Agent service request timed out after 60000ms.",
          renewalStatus: "FAILED",
        },
        where: { id: "issuance-old" },
      }),
    );
    expect(prismaMocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREDENTIAL_RENEWAL_FAILED",
          message: "Agent service request timed out after 60000ms.",
        }),
      }),
    );
    expect(createCredentialIssuanceFromOffer).not.toHaveBeenCalled();
  });
});
