import { describe, expect, it, vi, beforeEach } from "vitest";
import { createBatchActivationLinks } from "@/lib/agentClient";
import { sendCredentialActivationEmail } from "@/lib/email/credential-activation";
import { getMockAdminState, resetMockActivationStore } from "@/lib/api/mockActivationStore";
import { queueRealBatchIssuance, queueRealStudentIssuance, StudentIssuanceError } from "@/lib/issuance/batchIssuance";

vi.mock("@/lib/agentClient", () => ({
  createBatchActivationLinks: vi.fn(),
}));

vi.mock("@/lib/email/credential-activation", () => ({
  sendCredentialActivationEmail: vi.fn(),
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
  });

  it("issues Caleb's simulated student credential through the agent service and sends email", async () => {
    vi.mocked(createBatchActivationLinks).mockResolvedValue({
      failures: [],
      offers: [
        {
          activationId: "activation-001",
          activationUrl: "unifywallet://activate?token=real-token",
          credentialExchangeId: "credential-exchange-001",
          email: "caleb.voskuil@gmail.com",
          expiresAt: "2026-04-28T10:00:00.000Z",
          externalId: "student-demo-100",
          studentId: "student-demo-100",
          walletId: "wallet-student-demo-100",
        },
      ],
    });

    const result = await queueRealBatchIssuance(new Date("2026-04-27T10:00:00Z"));

    expect(createBatchActivationLinks).toHaveBeenCalledWith({
      credentialDefinitionId: "cred-def-id",
      students: [
        expect.objectContaining({
          email: "caleb.voskuil@gmail.com",
          externalId: "student-demo-100",
          walletId: "wallet-student-demo-100",
        }),
      ],
    });
    expect(vi.mocked(createBatchActivationLinks).mock.calls[0][0].students[0].attributes).toEqual([
      { name: "studentNumber", value: "VOSCAL100" },
      { name: "firstName", value: "Caleb" },
      { name: "lastName", value: "Voskuil" },
      { name: "faculty", value: "Health Sciences" },
      { name: "year", value: "2026" },
    ]);
    expect(sendCredentialActivationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        activationUrl: "unifywallet://activate?token=real-token",
        studentName: "Caleb Voskuil",
        to: "caleb.voskuil@gmail.com",
      }),
    );
    expect(result.activationDeliveries[0]).toMatchObject({
      activationUrl: "unifywallet://activate?token=real-token",
      credentialExchangeId: "credential-exchange-001",
      credentialId: "credential-demo-100",
      email: "caleb.voskuil@gmail.com",
      status: "Delivered",
      studentId: "student-demo-100",
    });
  });

  it("issues only Caleb when requested from the student detail action", async () => {
    vi.mocked(createBatchActivationLinks).mockResolvedValue({
      failures: [],
      offers: [
        {
          activationId: "activation-caleb",
          activationUrl: "unifywallet://activate?token=caleb-token",
          credentialExchangeId: "credential-exchange-caleb",
          email: "caleb.voskuil@gmail.com",
          expiresAt: "2026-04-28T10:00:00.000Z",
          externalId: "student-demo-100",
          studentId: "student-demo-100",
          walletId: "wallet-student-demo-100",
        },
      ],
    });

    const result = await queueRealStudentIssuance("student-demo-100", new Date("2026-04-27T10:00:00Z"));
    const caleb = getMockAdminState().students.find((student) => student.profile.id === "student-demo-100");

    expect(createBatchActivationLinks).toHaveBeenCalledWith({
      credentialDefinitionId: "cred-def-id",
      students: [
        expect.objectContaining({
          email: "caleb.voskuil@gmail.com",
          externalId: "student-demo-100",
          walletId: "wallet-student-demo-100",
        }),
      ],
    });
    expect(result.requestedCount).toBe(1);
    expect(result.issuedCredentialIds).toEqual(["credential-demo-100"]);
    expect(caleb?.credential.lifecycleState).toBe("Offered");
  });

  it("does not issue a credential for a student that is already active", async () => {
    await expect(queueRealStudentIssuance("student-demo-001")).rejects.toMatchObject({
      message: "Student credential is not ready for issuance in its current lifecycle state.",
      status: 409,
    } satisfies Partial<StudentIssuanceError>);
    expect(createBatchActivationLinks).not.toHaveBeenCalled();
  });
});
