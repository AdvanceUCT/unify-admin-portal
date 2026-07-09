// @vitest-environment node
//
// See importRoutes.test.ts for why this file needs the node environment
// (jsdom's File doesn't interoperate with Request.formData() round trips).
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/students/import/preview/route";
import { prisma } from "@/lib/db/prisma";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { getActiveCustomFieldDefinitions } from "@/lib/imports/customFields";
import { getImportMapping } from "@/lib/imports/mapping";
import { saveImportPreview } from "@/lib/imports/run";
import { getUniversityProfile } from "@/lib/university/profile";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    student: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentAdminSession: vi.fn(),
}));

vi.mock("@/lib/university/profile", () => ({
  getUniversityProfile: vi.fn(),
}));

vi.mock("@/lib/imports/customFields", () => ({
  getActiveCustomFieldDefinitions: vi.fn(),
}));

vi.mock("@/lib/imports/mapping", async () => {
  const actual = await vi.importActual<typeof import("@/lib/imports/mapping")>("@/lib/imports/mapping");
  return {
    ...actual,
    getImportMapping: vi.fn(),
  };
});

vi.mock("@/lib/imports/run", () => ({
  saveImportPreview: vi.fn(),
}));

function adminSession() {
  return { user: { id: "admin-001", role: "SUPER_ADMIN" } };
}

function previewRequest(file: File | null) {
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  }
  return new Request("http://localhost:3000/api/students/import/preview", { body: formData, method: "POST" });
}

const csvContent = [
  "Student No,First Name,Surname,Email,Faculty,Programme,Cohort",
  "ADA001,Ada,Lovelace,ada@example.edu,Science,Computer Science,2026",
  "BOB002,Bob,Marley,bob@example.edu,Engineering,Mechanical Engineering,2026",
].join("\n");

const fullColumnMap = {
  cohort: "Cohort",
  email: "Email",
  faculty: "Faculty",
  firstName: "First Name",
  lastName: "Surname",
  programme: "Programme",
  studentNumber: "Student No",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentAdminSession).mockResolvedValue(adminSession() as never);
  vi.mocked(getUniversityProfile).mockResolvedValue({ id: "profile-001" } as never);
  vi.mocked(getActiveCustomFieldDefinitions).mockResolvedValue([{ key: "cohort", label: "Cohort" }] as never);
  vi.mocked(getImportMapping).mockResolvedValue({ columnMap: fullColumnMap } as never);
  vi.mocked(prisma.student.findMany).mockResolvedValue([]);
  vi.mocked(saveImportPreview).mockResolvedValue({} as never);
});

describe("POST /api/students/import/preview", () => {
  it("rejects a viewer role (read-only)", async () => {
    vi.mocked(getCurrentAdminSession).mockResolvedValue({ user: { role: "VIEWER" } } as never);

    const response = await POST(previewRequest(new File([csvContent], "students.csv")));

    expect(response.status).toBe(403);
  });

  it("returns 409 when no mapping has been saved yet", async () => {
    vi.mocked(getImportMapping).mockResolvedValue(null);

    const response = await POST(previewRequest(new File([csvContent], "students.csv")));

    expect(response.status).toBe(409);
  });

  it("returns 409 when the saved mapping is missing a required system field", async () => {
    const { faculty: _faculty, ...incompleteMap } = fullColumnMap;
    vi.mocked(getImportMapping).mockResolvedValue({ columnMap: incompleteMap } as never);

    const response = await POST(previewRequest(new File([csvContent], "students.csv")));
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(409);
    expect(body.error.message).toMatch(/Faculty/);
  });

  it("returns 409 when the saved mapping is missing a required custom field", async () => {
    const { cohort: _cohort, ...columnMapWithoutCohort } = fullColumnMap;
    vi.mocked(getImportMapping).mockResolvedValue({ columnMap: columnMapWithoutCohort } as never);

    const response = await POST(previewRequest(new File([csvContent], "students.csv")));
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(409);
    expect(body.error.message).toMatch(/Cohort/);
  });

  it("returns 400 when no file is provided", async () => {
    const response = await POST(previewRequest(null));

    expect(response.status).toBe(400);
  });

  it("classifies rows and persists the preview", async () => {
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      {
        attributes: { cohort: "2026" },
        email: "ada@example.edu",
        faculty: "Science",
        firstName: "Ada",
        id: "student-1",
        lastName: "Lovelace",
        programme: "Computer Science",
        studentNumber: "ADA001",
      },
    ] as never);

    const response = await POST(previewRequest(new File([csvContent], "students.csv")));
    const body = (await response.json()) as {
      counts: Record<string, number>;
      rows: { status: string; studentNumber: string | null }[];
    };

    expect(response.status).toBe(200);
    expect(body.counts).toEqual({ error: 0, missing: 0, new: 1, unchanged: 1, updated: 0 });
    expect(saveImportPreview).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "students.csv", universityProfileId: "profile-001" }),
    );
  });
});
