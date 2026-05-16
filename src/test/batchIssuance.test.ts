import { describe, expect, it, vi, beforeEach } from "vitest";
import { createBatchActivationLinks } from "@/lib/agentClient";
import { sendCredentialActivationEmail } from "@/lib/email/credential-activation";
import { resetMockActivationStore } from "@/lib/api/mockActivationStore";
import { recordCredentialOfferSentAudit } from "@/lib/credentials/audit";
import { queueRealBatchIssuance, queueRealStudentIssuance, StudentIssuanceError } from "@/lib/issuance/batchIssuance";
import { assertCredentialIssuanceAllowed } from "@/lib/credentials/status";

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
  createCredentialIssuanceFromOffer: vi.fn(async (params: { studentId: string }) => ({
    id: params.studentId === "student-demo-100" ? "credential-demo-100" : "credential-demo-001",
  })),
  overlayCredentialStatuses: vi.fn(async (students) => students),
  overlayCredentialStatusForStudent: vi.fn(async (student) => student),
  reconcileCredentialEventLogs: vi.fn(async () => undefined),
}));

vi.mock("@/lib/university/profile", () => ({
  getUniversityProfile: vi.fn(async () => ({ id: "profile-001" })),
}));

vi.mock("@/lib/university/credentialSchema", () => ({
  getActiveCredentialSchema: vi.fn(async () => ({
    credentialDefinitionId: "cred-def-id",
    schemaAttributes: ["studentNumber", "firstName", "lastName", "faculty", "year"],
  })),
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
        studentId: "student-demo-100",
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
        studentId: "student-demo-100",
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
});
