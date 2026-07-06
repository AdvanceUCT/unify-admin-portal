import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuditAction, ImportRowStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { prisma } from "@/lib/db/prisma";
import { commitImportRun, NoImportRunError } from "@/lib/imports/commit";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
}));

const { txMock } = vi.hoisted(() => ({
  txMock: {
    $executeRaw: vi.fn(),
    importRun: { delete: vi.fn() },
    student: { createMany: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: typeof txMock) => Promise<void>) => callback(txMock)),
    importRun: { findUnique: vi.fn() },
  },
}));

function row(overrides: Partial<{ status: ImportRowStatus; studentNumber: string | null; mappedData: unknown }> = {}) {
  return {
    diff: null,
    errors: null,
    mappedData: { email: "ada@example.edu", faculty: "Science", firstName: "Ada", lastName: "Lovelace", studentNumber: "ADA001" },
    rowNumber: 2,
    status: ImportRowStatus.NEW,
    studentNumber: "ADA001",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("commitImportRun", () => {
  it("throws NoImportRunError when there is no pending run", async () => {
    vi.mocked(prisma.importRun.findUnique).mockResolvedValue(null);

    await expect(commitImportRun({ universityProfileId: "profile-001" })).rejects.toBeInstanceOf(NoImportRunError);
  });

  it("bulk-creates New rows and bulk-updates Updated rows in one call each, skipping Unchanged/Missing/Error", async () => {
    vi.mocked(prisma.importRun.findUnique).mockResolvedValue({
      filename: "students.csv",
      id: "run-001",
      rows: [
        row({ status: ImportRowStatus.NEW, studentNumber: "NEW001" }),
        row({ status: ImportRowStatus.UPDATED, studentNumber: "UPD002" }),
        row({ status: ImportRowStatus.UNCHANGED, studentNumber: "SAME003" }),
        row({ status: ImportRowStatus.MISSING, studentNumber: "GONE004" }),
        row({ status: ImportRowStatus.ERROR, studentNumber: "BAD005" }),
      ],
    } as never);

    await commitImportRun({ universityProfileId: "profile-001" });

    expect(txMock.student.createMany).toHaveBeenCalledTimes(1);
    const createManyCall = vi.mocked(txMock.student.createMany).mock.calls[0][0];
    expect(createManyCall.data.map((entry: { studentNumber: string }) => entry.studentNumber)).toEqual(["NEW001"]);
    expect(createManyCall.skipDuplicates).toBe(true);

    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
    const [, studentNumbers] = vi.mocked(txMock.$executeRaw).mock.calls[0] as [unknown, string[]];
    expect(studentNumbers).toEqual(["UPD002"]);
  });

  it("splits mappedData into platform columns vs schema attributes for created rows", async () => {
    vi.mocked(prisma.importRun.findUnique).mockResolvedValue({
      filename: "students.csv",
      id: "run-001",
      rows: [row()],
    } as never);

    await commitImportRun({ universityProfileId: "profile-001" });

    const createManyCall = vi.mocked(txMock.student.createMany).mock.calls[0][0];
    expect(createManyCall.data[0]).toMatchObject({
      attributes: { faculty: "Science" },
      email: "ada@example.edu",
      firstName: "Ada",
      lastName: "Lovelace",
      source: "csv",
      studentNumber: "ADA001",
    });
  });

  it("passes each field as a parallel array for the bulk update, with attributes pre-serialized to JSON", async () => {
    vi.mocked(prisma.importRun.findUnique).mockResolvedValue({
      filename: "students.csv",
      id: "run-001",
      rows: [row({ status: ImportRowStatus.UPDATED })],
    } as never);

    await commitImportRun({ universityProfileId: "profile-001" });

    const [, studentNumbers, emails, firstNames, lastNames, attributesJson] = vi.mocked(txMock.$executeRaw).mock
      .calls[0] as [unknown, string[], string[], string[], string[], string[]];
    expect(studentNumbers).toEqual(["ADA001"]);
    expect(emails).toEqual(["ada@example.edu"]);
    expect(firstNames).toEqual(["Ada"]);
    expect(lastNames).toEqual(["Lovelace"]);
    expect(attributesJson).toEqual([JSON.stringify({ faculty: "Science" })]);
  });

  it("skips the bulk update call entirely when there are no Updated rows", async () => {
    vi.mocked(prisma.importRun.findUnique).mockResolvedValue({
      filename: "students.csv",
      id: "run-001",
      rows: [row({ status: ImportRowStatus.NEW })],
    } as never);

    await commitImportRun({ universityProfileId: "profile-001" });

    expect(txMock.$executeRaw).not.toHaveBeenCalled();
  });

  it("writes a single audit log entry with the counts, and deletes the staged run", async () => {
    vi.mocked(prisma.importRun.findUnique).mockResolvedValue({
      filename: "students.csv",
      id: "run-001",
      rows: [
        row({ status: ImportRowStatus.NEW }),
        row({ status: ImportRowStatus.UPDATED, studentNumber: "UPD002" }),
        row({ status: ImportRowStatus.UNCHANGED, studentNumber: "SAME003" }),
        row({ status: ImportRowStatus.MISSING, studentNumber: "GONE004" }),
        row({ status: ImportRowStatus.ERROR, studentNumber: "BAD005" }),
      ],
    } as never);

    const result = await commitImportRun({ actorId: "admin-001", universityProfileId: "profile-001" });

    expect(result).toEqual({ errorCount: 1, missingCount: 1, newCount: 1, unchangedCount: 1, updatedCount: 1 });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.STUDENT_IMPORT_COMMITTED,
        actorId: "admin-001",
        meta: {
          errorCount: 1,
          filename: "students.csv",
          missingCount: 1,
          newCount: 1,
          unchangedCount: 1,
          updatedCount: 1,
        },
      }),
      txMock,
    );
    expect(txMock.importRun.delete).toHaveBeenCalledWith({ where: { id: "run-001" } });
  });
});
