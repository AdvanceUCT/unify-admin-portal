import { beforeEach, describe, expect, it, vi } from "vitest";

const credentialStatus = vi.hoisted(() => ({
  getCredentialDeliveryByIssuanceId: vi.fn(),
  getDashboardCredentialSummary: vi.fn(),
  overlayCredentialStatusForStudent: vi.fn(),
  overlayCredentialStatuses: vi.fn(),
}));
const recentAudit = vi.hoisted(() => ({
  getRecentCredentialAuditActivityEvents: vi.fn(),
}));
const repository = vi.hoisted(() => ({
  getAllStudents: vi.fn(),
  getStudentById: vi.fn(),
  getStudentProgrammesByFaculty: vi.fn(),
  searchStudents: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/mockData", () => ({
  mockBatchIssuancePreview: {
    batchId: "batch-001",
    cohortId: "cohort-001",
    requestedCount: 100,
    status: "Draft",
  },
}));
vi.mock("@/lib/credentials/audit", () => recentAudit);
vi.mock("@/lib/credentials/status", () => credentialStatus);
vi.mock("@/lib/students/repository", () => repository);

describe("server API helpers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads all students directly and applies the credential status overlay", async () => {
    const { getStudents } = await import("@/lib/api/server");
    const records = [{ profile: { id: "student-1" }, credential: { studentNumber: "S1" } }];
    const overlaid = [{ profile: { id: "student-1" }, credential: { lifecycleState: "ACTIVE" } }];
    repository.getAllStudents.mockResolvedValue(records);
    credentialStatus.overlayCredentialStatuses.mockResolvedValue(overlaid);

    await expect(getStudents()).resolves.toBe(overlaid);
    expect(repository.getAllStudents).toHaveBeenCalledOnce();
    expect(credentialStatus.overlayCredentialStatuses).toHaveBeenCalledWith(records);
  });

  it("uses repository search for non-empty student queries", async () => {
    const { getStudents } = await import("@/lib/api/server");
    const records = [{ profile: { id: "student-2" }, credential: { studentNumber: "S2" } }];
    repository.searchStudents.mockResolvedValue(records);
    credentialStatus.overlayCredentialStatuses.mockResolvedValue(records);

    await getStudents({ q: "  S2  " });

    expect(repository.searchStudents).toHaveBeenCalledWith("S2");
    expect(repository.getAllStudents).not.toHaveBeenCalled();
  });

  it("returns undefined for missing student details without overlaying", async () => {
    const { getStudentById } = await import("@/lib/api/server");
    repository.getStudentById.mockResolvedValue(undefined);

    await expect(getStudentById("missing")).resolves.toBeUndefined();
    expect(credentialStatus.overlayCredentialStatusForStudent).not.toHaveBeenCalled();
  });

  it("overlays one student detail and exposes batch dropdown data", async () => {
    const { getProgrammesByFaculty, getStudentById } = await import("@/lib/api/server");
    const record = { profile: { id: "student-3" }, credential: { studentNumber: "S3" } };
    const overlaid = { ...record, credential: { lifecycleState: "OFFER_SENT" } };
    repository.getStudentById.mockResolvedValue(record);
    repository.getStudentProgrammesByFaculty.mockResolvedValue({ Science: ["BSc"] });
    credentialStatus.overlayCredentialStatusForStudent.mockResolvedValue(overlaid);

    await expect(getStudentById("student-3")).resolves.toBe(overlaid);
    await expect(getProgrammesByFaculty()).resolves.toEqual({ Science: ["BSc"] });
  });

  it("returns the initial batch preview without going through the browser API client", async () => {
    const { getInitialBatchIssuancePreview } = await import("@/lib/api/server");

    await expect(getInitialBatchIssuancePreview()).resolves.toMatchObject({
      batchId: "batch-001",
      requestedCount: 100,
      status: "Draft",
    });
  });
});
