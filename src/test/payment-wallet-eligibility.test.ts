import { beforeEach, describe, expect, it, vi } from "vitest";

const database = {
  credentialIssuance: {
    findFirst: vi.fn(),
  },
  student: {
    findUnique: vi.fn(),
  },
  studentPaymentSession: {
    create: vi.fn(),
  },
  universityProfile: {
    findMany: vi.fn(),
  },
};

vi.mock("@/lib/config/env", () => ({
  env: {
    PAYMENT_OTP_BYPASS_ENABLED: true,
    PAYMENT_OTP_DEBUG_LOG_CODE: false,
    PAYMENT_WALLET_TOPUPS_ENABLED: true,
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: database }));

vi.mock("@/lib/payments/accounts", () => ({
  ensureStudentWalletAccount: vi.fn(async () => undefined),
}));

describe("payment wallet activation eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.universityProfile.findMany.mockResolvedValue([{ paymentWalletEnabled: true }]);
    database.student.findUnique.mockImplementation(async ({ where }: { where: { id?: string; studentNumber?: string } }) => {
      if (where.studentNumber === "VOSCAL099") return { id: "student-internal-1", studentNumber: "VOSCAL099" };
      if (where.id === "student-internal-1") return { studentNumber: "VOSCAL099" };
      return null;
    });
    database.credentialIssuance.findFirst.mockResolvedValue({ id: "issuance-1" });
    database.studentPaymentSession.create.mockResolvedValue({
      id: "session-1",
      accessTokenExpiresAt: new Date("2099-01-01T00:15:00.000Z"),
      refreshTokenExpiresAt: new Date("2099-01-31T00:00:00.000Z"),
    });
  });

  it("treats student-number keyed credential issuances as payment eligible", async () => {
    const { requestStudentPaymentActivation } = await import("@/lib/payments/walletSession");

    await expect(requestStudentPaymentActivation({
      deviceId: "device-1",
      studentNumber: "VOSCAL099",
    })).resolves.toMatchObject({ sessionId: "session-1" });

    expect(database.credentialIssuance.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        studentId: { in: ["student-internal-1", "VOSCAL099"] },
        status: { in: ["ACCEPTED", "ISSUED"] },
      }),
    }));
  });
});
