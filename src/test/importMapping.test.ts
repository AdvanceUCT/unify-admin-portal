import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db/prisma";
import {
  assertRequiredFieldsMapped,
  getImportFieldDefinitions,
  getImportMapping,
  PLATFORM_FIELDS,
  sanitizeColumnMap,
  saveImportMapping,
} from "@/lib/imports/mapping";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    importMapping: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const importMapping = vi.mocked(prisma.importMapping);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getImportFieldDefinitions", () => {
  it("includes all fixed platform fields as required", () => {
    const definitions = getImportFieldDefinitions([]);

    for (const platformField of PLATFORM_FIELDS) {
      expect(definitions).toContainEqual(platformField);
    }
  });

  it("dedupes schema attributes that share a name with a platform field", () => {
    const definitions = getImportFieldDefinitions(["studentNumber", "firstName", "lastName", "faculty", "year"]);

    expect(definitions.filter((field) => field.name === "studentNumber")).toHaveLength(1);
    expect(definitions.filter((field) => field.name === "firstName")).toHaveLength(1);
    expect(definitions.filter((field) => field.name === "lastName")).toHaveLength(1);
  });

  it("adds schema-only attributes as optional fields with humanized labels", () => {
    const definitions = getImportFieldDefinitions(["faculty", "graduationYear"]);

    expect(definitions).toContainEqual({ label: "Faculty", name: "faculty", required: false });
    expect(definitions).toContainEqual({ label: "Graduation year", name: "graduationYear", required: false });
  });
});

describe("assertRequiredFieldsMapped", () => {
  const definitions = getImportFieldDefinitions(["faculty"]);

  it("throws when a required platform field has no mapped column", () => {
    expect(() => assertRequiredFieldsMapped({ email: "Email" }, definitions)).toThrow(/Student number/);
  });

  it("does not throw when only optional schema fields are unmapped", () => {
    expect(() =>
      assertRequiredFieldsMapped(
        { email: "Email", firstName: "First", lastName: "Last", studentNumber: "No." },
        definitions,
      ),
    ).not.toThrow();
  });
});

describe("sanitizeColumnMap", () => {
  const definitions = getImportFieldDefinitions(["faculty"]);

  it("drops unknown field names and non-string values", () => {
    const sanitized = sanitizeColumnMap(
      { email: "Email", faculty: 42, unknownField: "Whatever" },
      definitions,
    );

    expect(sanitized).toEqual({ email: "Email" });
  });

  it("drops empty/whitespace-only values", () => {
    expect(sanitizeColumnMap({ email: "   " }, definitions)).toEqual({});
  });

  it("returns an empty object for non-object input", () => {
    expect(sanitizeColumnMap(null, definitions)).toEqual({});
    expect(sanitizeColumnMap("not an object", definitions)).toEqual({});
  });
});

describe("getImportMapping / saveImportMapping", () => {
  it("reads the mapping by university profile id", async () => {
    importMapping.findUnique.mockResolvedValue({
      columnMap: { email: "Email" },
    } as never);

    const result = await getImportMapping("profile-001");

    expect(importMapping.findUnique).toHaveBeenCalledWith({ where: { universityProfileId: "profile-001" } });
    expect(result).toMatchObject({ columnMap: { email: "Email" } });
  });

  it("upserts a single mapping row per university", async () => {
    importMapping.upsert.mockResolvedValue({} as never);

    await saveImportMapping({
      columnMap: { email: "Email" },
      schemaVersionSnapshot: "StudentIdentity@1.0",
      universityProfileId: "profile-001",
    });

    expect(importMapping.upsert).toHaveBeenCalledWith({
      create: {
        columnMap: { email: "Email" },
        schemaVersionSnapshot: "StudentIdentity@1.0",
        universityProfileId: "profile-001",
      },
      update: {
        columnMap: { email: "Email" },
        schemaVersionSnapshot: "StudentIdentity@1.0",
      },
      where: { universityProfileId: "profile-001" },
    });
  });
});
