import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImportRowStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import type { ReconciledImportRow } from "@/lib/imports/reconcile";
import { saveImportPreview } from "@/lib/imports/run";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    importRun: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveImportPreview", () => {
  it("deletes any existing run for the university before creating the new one", async () => {
    vi.mocked(prisma.importRun.create).mockResolvedValue({} as never);

    const rows: ReconciledImportRow[] = [
      { mappedData: { studentNumber: "ADA001" }, rowNumber: 2, status: "New", studentNumber: "ADA001" },
    ];

    await saveImportPreview({
      filename: "students.csv",
      mappingSnapshot: { studentNumber: "Student No" },
      rows,
      universityProfileId: "profile-001",
    });

    expect(prisma.importRun.deleteMany).toHaveBeenCalledWith({ where: { universityProfileId: "profile-001" } });
    expect(prisma.importRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filename: "students.csv",
          universityProfileId: "profile-001",
        }),
      }),
    );
  });

  it("maps status and normalizes null diff/errors/mappedData to undefined for Prisma", async () => {
    vi.mocked(prisma.importRun.create).mockResolvedValue({} as never);

    await saveImportPreview({
      filename: "students.csv",
      mappingSnapshot: {},
      rows: [{ rowNumber: null, status: "Missing", studentNumber: "BOB002" }],
      universityProfileId: "profile-001",
    });

    const call = vi.mocked(prisma.importRun.create).mock.calls[0][0] as {
      data: { rows: { createMany: { data: { status: string; diff?: unknown; errors?: unknown; mappedData?: unknown }[] } } };
    };
    expect(call.data.rows.createMany.data[0]).toMatchObject({
      diff: undefined,
      errors: undefined,
      mappedData: undefined,
      status: ImportRowStatus.MISSING,
      studentNumber: "BOB002",
    });
  });
});
