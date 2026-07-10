import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/students/import/commit/route";
import { getCurrentAdminSession, getSessionForAudit } from "@/lib/auth/session";
import { commitImportRun, NoImportRunError } from "@/lib/imports/commit";
import { getUniversityProfile } from "@/lib/university/profile";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentAdminSession: vi.fn(),
  getSessionForAudit: vi.fn(),
}));

vi.mock("@/lib/university/profile", () => ({
  getUniversityProfile: vi.fn(),
}));

vi.mock("@/lib/imports/commit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/imports/commit")>("@/lib/imports/commit");
  return {
    ...actual,
    commitImportRun: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentAdminSession).mockResolvedValue({ user: { id: "admin-001", role: "SUPER_ADMIN" } } as never);
  vi.mocked(getSessionForAudit).mockResolvedValue({ actorId: "admin-001" } as never);
  vi.mocked(getUniversityProfile).mockResolvedValue({ id: "profile-001" } as never);
});

function commitRequest(importRunId: unknown = "run-001") {
  return new Request("http://localhost:3000/api/students/import/commit", {
    body: JSON.stringify({ importRunId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/students/import/commit", () => {
  it("rejects a viewer role (read-only)", async () => {
    vi.mocked(getCurrentAdminSession).mockResolvedValue({ user: { role: "VIEWER" } } as never);

    const response = await POST(commitRequest());

    expect(response.status).toBe(403);
    expect(commitImportRun).not.toHaveBeenCalled();
  });

  it("returns 409 when there is no pending import to commit", async () => {
    vi.mocked(commitImportRun).mockRejectedValue(new NoImportRunError("No pending import preview to commit."));

    const response = await POST(commitRequest());

    expect(response.status).toBe(409);
  });

  it("returns 400 when the selected import run ID is missing", async () => {
    const response = await POST(commitRequest(""));

    expect(response.status).toBe(400);
    expect(commitImportRun).not.toHaveBeenCalled();
  });

  it("commits and returns the counts", async () => {
    vi.mocked(commitImportRun).mockResolvedValue({
      errorCount: 0,
      missingCount: 0,
      newCount: 90,
      unchangedCount: 10,
      updatedCount: 0,
    });

    const response = await POST(commitRequest("run-001"));
    const body = (await response.json()) as { newCount: number; updatedCount: number };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ newCount: 90, updatedCount: 0 });
    expect(commitImportRun).toHaveBeenCalledWith({
      actorId: "admin-001",
      importRunId: "run-001",
      universityProfileId: "profile-001",
    });
  });
});
