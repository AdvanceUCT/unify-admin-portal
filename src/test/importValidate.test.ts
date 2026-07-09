import { describe, expect, it, vi } from "vitest";

import { getImportFieldDefinitions } from "@/lib/imports/mapping";
import { validateRows } from "@/lib/imports/validate";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {},
}));

const fieldDefinitions = getImportFieldDefinitions([{ key: "cohort", label: "Cohort" }]);
const columnMap = {
  cohort: "Cohort",
  email: "Email",
  faculty: "Faculty",
  firstName: "First Name",
  lastName: "Surname",
  programme: "Programme",
  studentNumber: "Student No",
};

function row(overrides: Partial<Record<string, string>> = {}) {
  return {
    Cohort: "2026",
    Email: "ada@example.edu",
    Faculty: "Science",
    "First Name": "Ada",
    Programme: "Computer Science",
    "Student No": "ADA001",
    Surname: "Lovelace",
    ...overrides,
  };
}

describe("validateRows", () => {
  it("maps a valid row with no errors", () => {
    const [result] = validateRows([row()], columnMap, fieldDefinitions);

    expect(result.errors).toEqual([]);
    expect(result.studentNumber).toBe("ADA001");
    expect(result.mappedData).toEqual({
      cohort: "2026",
      email: "ada@example.edu",
      faculty: "Science",
      firstName: "Ada",
      lastName: "Lovelace",
      programme: "Computer Science",
      studentNumber: "ADA001",
    });
  });

  it("flags a missing required (system field) value", () => {
    const [result] = validateRows([row({ "Student No": "" })], columnMap, fieldDefinitions);

    expect(result.studentNumber).toBeNull();
    expect(result.errors).toContain('Missing value for "Student number".');
  });

  it("flags a missing custom-field value the same as a missing system-field value — custom fields are required once added to the template", () => {
    const [result] = validateRows([row({ Cohort: "" })], columnMap, fieldDefinitions);

    expect(result.errors).toContain('Missing value for "Cohort".');
    expect(result.mappedData).not.toHaveProperty("cohort");
  });

  it("flags a custom field with no mapped column at all", () => {
    const { cohort: _cohort, ...columnMapWithoutCohort } = columnMap;
    const [result] = validateRows([row()], columnMapWithoutCohort, fieldDefinitions);

    expect(result.errors).toContain('Missing value for "Cohort".');
    expect(result.mappedData).not.toHaveProperty("cohort");
  });

  it("flags an invalid email address", () => {
    const [result] = validateRows([row({ Email: "not-an-email" })], columnMap, fieldDefinitions);

    expect(result.errors).toContain('Invalid email address "not-an-email".');
  });

  it("flags duplicate student numbers within the same file", () => {
    const results = validateRows(
      [row({ "First Name": "Ada" }), row({ "First Name": "Grace" })],
      columnMap,
      fieldDefinitions,
    );

    expect(results[0].errors[0]).toMatch(/Duplicate student number "ADA001" appears in 2 rows/);
    expect(results[1].errors[0]).toMatch(/Duplicate student number "ADA001" appears in 2 rows/);
  });

  it("assigns row numbers starting at 2 (line after the header)", () => {
    const results = validateRows([row(), row({ "Student No": "BOB002", Email: "bob@example.edu" })], columnMap, fieldDefinitions);

    expect(results[0].rowNumber).toBe(2);
    expect(results[1].rowNumber).toBe(3);
  });
});
