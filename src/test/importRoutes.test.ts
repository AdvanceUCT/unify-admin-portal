// @vitest-environment node
//
// File/FormData/Request in jsdom's environment don't interoperate with the
// runtime's fetch internals (a jsdom-constructed File fails `instanceof File`
// after a Request/formData() round trip) — these route tests need real Node
// fetch semantics, matching how Next.js actually executes route handlers.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST as postMapping } from "@/app/api/students/import/mapping/route";
import { POST as postUpload } from "@/app/api/students/import/upload/route";
import { getCurrentAdminSession } from "@/lib/auth/session";
import {
  getImportFieldDefinitions,
  getImportMapping,
  saveImportMapping,
} from "@/lib/imports/mapping";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    importMapping: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentAdminSession: vi.fn(),
}));

vi.mock("@/lib/university/profile", () => ({
  getUniversityProfile: vi.fn(),
}));

vi.mock("@/lib/university/credentialSchema", () => ({
  getActiveCredentialSchema: vi.fn(),
}));

vi.mock("@/lib/imports/mapping", async () => {
  const actual = await vi.importActual<typeof import("@/lib/imports/mapping")>("@/lib/imports/mapping");
  return {
    ...actual,
    getImportMapping: vi.fn(),
    saveImportMapping: vi.fn(),
  };
});

function adminSession(role: string | null = "SUPER_ADMIN") {
  return { user: { id: "admin-001", role } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUniversityProfile).mockResolvedValue({ id: "profile-001" } as never);
  vi.mocked(getActiveCredentialSchema).mockResolvedValue({
    schemaAttributes: ["studentNumber", "firstName", "lastName", "faculty", "year"],
    schemaName: "StudentIdentity",
    schemaVersion: "1.0",
  } as never);
});

describe("POST /api/students/import/upload", () => {
  function uploadRequest(file: File | null) {
    const formData = new FormData();
    if (file) {
      formData.append("file", file);
    }
    return new Request("http://localhost:3000/api/students/import/upload", {
      body: formData,
      method: "POST",
    });
  }

  it("rejects unauthenticated requests", async () => {
    vi.mocked(getCurrentAdminSession).mockResolvedValue(null as never);

    const response = await postUpload(uploadRequest(new File(["a,b\n1,2"], "students.csv")));

    expect(response.status).toBe(403);
  });

  it("returns 400 when no file is provided", async () => {
    vi.mocked(getCurrentAdminSession).mockResolvedValue(adminSession() as never);

    const response = await postUpload(uploadRequest(null));

    expect(response.status).toBe(400);
  });

  it("parses the header row of a valid CSV", async () => {
    vi.mocked(getCurrentAdminSession).mockResolvedValue(adminSession() as never);
    const file = new File(["Student No,First Name,Last Name\n1,Ada,Lovelace\n"], "students.csv", {
      type: "text/csv",
    });

    const response = await postUpload(uploadRequest(file));
    const body = (await response.json()) as { columns: string[] };

    expect(response.status).toBe(200);
    expect(body.columns).toEqual(["Student No", "First Name", "Last Name"]);
  });

  it("returns 400 for a file with no detectable columns", async () => {
    vi.mocked(getCurrentAdminSession).mockResolvedValue(adminSession() as never);
    const file = new File([""], "empty.csv", { type: "text/csv" });

    const response = await postUpload(uploadRequest(file));

    expect(response.status).toBe(400);
  });
});

describe("GET /api/students/import/mapping", () => {
  it("rejects unauthenticated requests", async () => {
    vi.mocked(getCurrentAdminSession).mockResolvedValue(null as never);

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("returns 409 when no university profile exists", async () => {
    vi.mocked(getCurrentAdminSession).mockResolvedValue(adminSession() as never);
    vi.mocked(getUniversityProfile).mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(409);
  });

  it("returns field definitions and any saved mapping", async () => {
    vi.mocked(getCurrentAdminSession).mockResolvedValue(adminSession() as never);
    vi.mocked(getImportMapping).mockResolvedValue({ columnMap: { email: "Email" } } as never);

    const response = await GET();
    const body = (await response.json()) as { columnMap: Record<string, string>; fieldDefinitions: unknown[] };

    expect(response.status).toBe(200);
    expect(body.columnMap).toEqual({ email: "Email" });
    expect(body.fieldDefinitions).toEqual(getImportFieldDefinitions(["studentNumber", "firstName", "lastName", "faculty", "year"]));
  });
});

describe("POST /api/students/import/mapping", () => {
  function mappingRequest(columnMap: unknown) {
    return new Request("http://localhost:3000/api/students/import/mapping", {
      body: JSON.stringify({ columnMap }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  }

  it("rejects a viewer role (read-only)", async () => {
    vi.mocked(getCurrentAdminSession).mockResolvedValue(adminSession("VIEWER") as never);

    const response = await postMapping(mappingRequest({ email: "Email" }));

    expect(response.status).toBe(403);
  });

  it("rejects a mapping missing required platform fields", async () => {
    vi.mocked(getCurrentAdminSession).mockResolvedValue(adminSession() as never);

    const response = await postMapping(mappingRequest({ email: "Email" }));

    expect(response.status).toBe(400);
    expect(saveImportMapping).not.toHaveBeenCalled();
  });

  it("saves a complete mapping", async () => {
    vi.mocked(getCurrentAdminSession).mockResolvedValue(adminSession() as never);
    vi.mocked(saveImportMapping).mockResolvedValue({
      columnMap: {
        email: "Email",
        firstName: "First",
        lastName: "Last",
        studentNumber: "No.",
      },
    } as never);

    const response = await postMapping(
      mappingRequest({
        email: "Email",
        firstName: "First",
        lastName: "Last",
        studentNumber: "No.",
      }),
    );

    expect(response.status).toBe(200);
    expect(saveImportMapping).toHaveBeenCalledWith({
      columnMap: {
        email: "Email",
        firstName: "First",
        lastName: "Last",
        studentNumber: "No.",
      },
      schemaVersionSnapshot: "StudentIdentity@1.0",
      universityProfileId: "profile-001",
    });
  });
});
