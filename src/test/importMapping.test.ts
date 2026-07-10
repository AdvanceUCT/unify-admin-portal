import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db/prisma";
import {
  assertNoDuplicateMappingTargets,
  assertNoSharedColumns,
  assertRequiredFieldsMapped,
  assignmentsToColumnMap,
  getImportFieldDefinitions,
  getImportMapping,
  isRequiredByActiveSchema,
  isSystemFieldName,
  parseMappingAssignments,
  saveImportMapping,
  SYSTEM_FIELDS,
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
  it("includes all fixed system fields as required", () => {
    const definitions = getImportFieldDefinitions([]);

    for (const systemField of SYSTEM_FIELDS) {
      expect(definitions).toContainEqual(systemField);
    }
  });

  it("dedupes a custom field that shares a key with a system field", () => {
    const definitions = getImportFieldDefinitions([{ key: "studentNumber", label: "Should be ignored" }]);

    expect(definitions.filter((field) => field.name === "studentNumber")).toHaveLength(1);
    expect(definitions.find((field) => field.name === "studentNumber")).toMatchObject({
      kind: "system",
      required: true,
    });
  });

  it("adds custom fields as required, with their admin-provided label", () => {
    const definitions = getImportFieldDefinitions([{ key: "yearOfStudy", label: "Year of study" }]);

    expect(definitions).toContainEqual({ kind: "custom", label: "Year of study", name: "yearOfStudy", required: true });
  });
});

describe("assertRequiredFieldsMapped", () => {
  const definitions = getImportFieldDefinitions([{ key: "cohort", label: "Cohort" }]);
  const completeMap = {
    cohort: "Cohort",
    email: "Email",
    faculty: "Faculty",
    firstName: "First",
    lastName: "Last",
    programme: "Programme",
    studentNumber: "No.",
  };

  it("throws when a required system field has no mapped column", () => {
    expect(() => assertRequiredFieldsMapped({ email: "Email" }, definitions)).toThrow(/Student number/);
  });

  it("throws when a custom field has no mapped column — custom fields are required once added to the template", () => {
    const { cohort: _cohort, ...incomplete } = completeMap;

    expect(() => assertRequiredFieldsMapped(incomplete, definitions)).toThrow(/Cohort/);
  });

  it("does not throw when every field, system and custom, is mapped", () => {
    expect(() => assertRequiredFieldsMapped(completeMap, definitions)).not.toThrow();
  });
});

describe("isRequiredByActiveSchema", () => {
  it("returns true when the key is in the schema's attributes", () => {
    expect(isRequiredByActiveSchema("programme", ["studentNumber", "programme"])).toBe(true);
  });

  it("returns false when the key is not in the schema's attributes", () => {
    expect(isRequiredByActiveSchema("cohort", ["studentNumber", "programme"])).toBe(false);
  });
});

describe("isSystemFieldName", () => {
  it("returns true for a system field name", () => {
    expect(isSystemFieldName("programme")).toBe(true);
  });

  it("returns false for a custom field name", () => {
    expect(isSystemFieldName("cohort")).toBe(false);
  });
});

describe("parseMappingAssignments", () => {
  const definitions = getImportFieldDefinitions([{ key: "cohort", label: "Cohort" }]);

  it("keeps assignments with a known field name and non-empty column", () => {
    const assignments = parseMappingAssignments(
      [
        { csvColumn: "Email", fieldName: "email" },
        { csvColumn: "Cohort Col", fieldName: "cohort" },
      ],
      definitions,
    );

    expect(assignments).toEqual([
      { csvColumn: "Email", fieldName: "email" },
      { csvColumn: "Cohort Col", fieldName: "cohort" },
    ]);
  });

  it("drops entries with unknown field names", () => {
    const assignments = parseMappingAssignments([{ csvColumn: "Whatever", fieldName: "unknownField" }], definitions);

    expect(assignments).toEqual([]);
  });

  it("drops entries with a blank column", () => {
    const assignments = parseMappingAssignments([{ csvColumn: "   ", fieldName: "email" }], definitions);

    expect(assignments).toEqual([]);
  });

  it("returns an empty array for non-array input", () => {
    expect(parseMappingAssignments(null, definitions)).toEqual([]);
    expect(parseMappingAssignments({ email: "Email" }, definitions)).toEqual([]);
  });
});

describe("assertNoDuplicateMappingTargets", () => {
  it("throws naming the field and columns when two columns map to the same field", () => {
    expect(() =>
      assertNoDuplicateMappingTargets([
        { csvColumn: "Cohort A", fieldName: "cohort" },
        { csvColumn: "Cohort B", fieldName: "cohort" },
      ]),
    ).toThrow(/"Cohort A".*"Cohort B".*"cohort"/);
  });

  it("does not throw when every field is assigned at most once", () => {
    expect(() =>
      assertNoDuplicateMappingTargets([
        { csvColumn: "Email", fieldName: "email" },
        { csvColumn: "Cohort", fieldName: "cohort" },
      ]),
    ).not.toThrow();
  });
});

describe("assertNoSharedColumns", () => {
  it("throws naming the column and the conflicting fields when one column is mapped to two fields", () => {
    expect(() =>
      assertNoSharedColumns([
        { csvColumn: "Email", fieldName: "email" },
        { csvColumn: "Email", fieldName: "cohort" },
      ]),
    ).toThrow(/"Email".*"email".*"cohort"/);
  });

  it("does not throw when every column is assigned to at most one field", () => {
    expect(() =>
      assertNoSharedColumns([
        { csvColumn: "Email", fieldName: "email" },
        { csvColumn: "Cohort", fieldName: "cohort" },
      ]),
    ).not.toThrow();
  });
});

describe("assignmentsToColumnMap", () => {
  it("reduces an assignment list into a field-name-keyed record", () => {
    expect(
      assignmentsToColumnMap([
        { csvColumn: "Email", fieldName: "email" },
        { csvColumn: "Cohort", fieldName: "cohort" },
      ]),
    ).toEqual({ cohort: "Cohort", email: "Email" });
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
      universityProfileId: "profile-001",
    });

    expect(importMapping.upsert).toHaveBeenCalledWith({
      create: {
        columnMap: { email: "Email" },
        universityProfileId: "profile-001",
      },
      update: {
        columnMap: { email: "Email" },
      },
      where: { universityProfileId: "profile-001" },
    });
  });
});
