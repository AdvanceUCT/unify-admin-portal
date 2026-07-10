import { beforeEach, describe, expect, it, vi } from "vitest";

import { CredentialIssuanceStatus } from "@/generated/prisma/enums";

const database = vi.hoisted(() => {
  const transaction = {
    credentialIssuance: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  return {
    transaction,
    runTransaction: vi.fn(),
    credentialIssuance: {
      findMany: vi.fn(),
    },
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    credentialIssuance: database.credentialIssuance,
    $transaction: database.runTransaction,
  },
}));

vi.mock("@/lib/credentials/audit", () => ({
  recordCredentialReissueRequestedAudit: vi.fn(),
}));

vi.mock("@/lib/credentials/status", () => ({
  overlayCredentialStatusForStudent: vi.fn(async (student) => student),
}));

vi.mock("@/lib/db/store", () => ({
  getAllStudents: vi.fn().mockResolvedValue([]),
  getStudentById: vi.fn(),
}));

vi.mock("@/lib/issuance/batchIssuance", () => ({
  StudentIssuanceError: class StudentIssuanceError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "StudentIssuanceError";
      this.status = status;
    }
  },
  issueSingleStudentActivationLink: vi.fn(),
}));

import { recordCredentialReissueRequestedAudit } from "@/lib/credentials/audit";
import {
  findIssuancesDueForRenewal,
  renewAllDueCredentials,
  renewCredentialIssuance,
} from "@/lib/credentials/renewal";
import { getStudentById } from "@/lib/db/store";
import { issueSingleStudentActivationLink } from "@/lib/issuance/batchIssuance";

function studentFixture(studentNumber: string) {
  return {
    credential: { studentNumber },
    profile: { email: "a@b.com", firstName: "A", id: "student-1", institution: "UCT", lastName: "B" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  database.runTransaction.mockImplementation(async (operation: (tx: unknown) => unknown) =>
    operation(database.transaction),
  );
});

describe("findIssuancesDueForRenewal", () => {
  it("queries ISSUED credentials whose expiry has passed, oldest first", async () => {
    database.credentialIssuance.findMany.mockResolvedValueOnce([]);
    const now = new Date("2026-07-10T00:00:00.000Z");

    await findIssuancesDueForRenewal(now);

    expect(database.credentialIssuance.findMany).toHaveBeenCalledWith({
      orderBy: { expiresAt: "asc" },
      take: 200,
      where: { expiresAt: { lte: now }, status: CredentialIssuanceStatus.ISSUED },
    });
  });
});

describe("renewCredentialIssuance", () => {
  const issuance = {
    credentialDefinitionId: "def_1",
    credentialExchangeId: "exchange_1",
    id: "issuance_1",
    status: CredentialIssuanceStatus.ISSUED,
    studentId: "student-number-1",
  };

  it("throws when the issuance is not found", async () => {
    database.transaction.credentialIssuance.findUnique.mockResolvedValueOnce(null);

    await expect(renewCredentialIssuance({ issuanceId: "missing", trigger: "MANUAL" })).rejects.toThrow(
      "Credential issuance was not found.",
    );
  });

  it("throws when the issuance is no longer ISSUED (lost a race to a concurrent renewal/revocation)", async () => {
    database.transaction.credentialIssuance.findUnique.mockResolvedValueOnce(issuance);
    database.transaction.credentialIssuance.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(renewCredentialIssuance({ issuanceId: "issuance_1", trigger: "AUTO" })).rejects.toThrow(
      "This credential is not currently issued, so it cannot be renewed.",
    );

    expect(getStudentById).not.toHaveBeenCalled();
    expect(issueSingleStudentActivationLink).not.toHaveBeenCalled();
  });

  it("expires the old issuance, audits it, and reissues to the student", async () => {
    database.transaction.credentialIssuance.findUnique.mockResolvedValueOnce(issuance);
    database.transaction.credentialIssuance.updateMany.mockResolvedValueOnce({ count: 1 });
    vi.mocked(getStudentById).mockResolvedValueOnce(studentFixture("student-number-1") as never);
    vi.mocked(issueSingleStudentActivationLink).mockResolvedValueOnce({ status: "Queued" } as never);

    const result = await renewCredentialIssuance({
      actorId: "admin_1",
      issuanceId: "issuance_1",
      trigger: "MANUAL",
    });

    expect(database.transaction.credentialIssuance.updateMany).toHaveBeenCalledWith({
      data: { status: CredentialIssuanceStatus.EXPIRED },
      where: { id: "issuance_1", status: CredentialIssuanceStatus.ISSUED },
    });
    expect(recordCredentialReissueRequestedAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin_1",
        credentialIssuanceId: "issuance_1",
        trigger: "MANUAL",
      }),
      database.transaction,
    );
    expect(issueSingleStudentActivationLink).toHaveBeenCalledWith(expect.anything(), expect.any(Date), "admin_1", {
      renewedFromIssuanceId: "issuance_1",
    });
    expect(result).toEqual({ status: "Queued" });
  });

  it("throws when the student behind the expired issuance can't be found", async () => {
    database.transaction.credentialIssuance.findUnique.mockResolvedValueOnce(issuance);
    database.transaction.credentialIssuance.updateMany.mockResolvedValueOnce({ count: 1 });
    vi.mocked(getStudentById).mockResolvedValueOnce(undefined);

    await expect(renewCredentialIssuance({ issuanceId: "issuance_1", trigger: "AUTO" })).rejects.toThrow(
      "Student record was not found.",
    );
  });
});

describe("renewAllDueCredentials", () => {
  it("renews every due issuance and collects per-issuance failures without stopping the run", async () => {
    database.credentialIssuance.findMany.mockResolvedValueOnce([
      { ...issuanceFixture("issuance_ok", "student-ok") },
      { ...issuanceFixture("issuance_fail", "student-fail") },
    ]);

    database.transaction.credentialIssuance.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        if (where.id === "issuance_ok") return issuanceFixture("issuance_ok", "student-ok");
        if (where.id === "issuance_fail") return issuanceFixture("issuance_fail", "student-fail");
        return null;
      },
    );
    database.transaction.credentialIssuance.updateMany.mockResolvedValue({ count: 1 });

    vi.mocked(getStudentById).mockImplementation(async (studentId: string) =>
      studentId === "student-ok" ? (studentFixture("student-ok") as never) : undefined,
    );
    vi.mocked(issueSingleStudentActivationLink).mockResolvedValue({ status: "Queued" } as never);

    const summary = await renewAllDueCredentials(new Date());

    expect(summary.attempted).toBe(2);
    expect(summary.renewed).toBe(1);
    expect(summary.failed).toEqual([{ issuanceId: "issuance_fail", message: "Student record was not found." }]);
  });
});

function issuanceFixture(id: string, studentId: string) {
  return {
    credentialDefinitionId: "def_1",
    credentialExchangeId: `exchange_${id}`,
    id,
    status: CredentialIssuanceStatus.ISSUED,
    studentId,
  };
}
