import { describe, expect, it, vi } from "vitest";

import { getImportFieldDefinitions } from "@/lib/imports/mapping";
import { validateRows } from "@/lib/imports/validate";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {},
}));

const fieldDefinitions = getImportFieldDefinitions(["studentNumber", "firstName", "lastName", "faculty", "year"]);
const columnMap = {
  email: "Email",
  faculty: "Faculty",
  firstName: "First Name",
  lastName: "Surname",
  studentNumber: "Student No",
  year: "Year",
};

function row(overrides: Partial<Record<string, string>> = {}) {
  return {
    Email: "ada@example.edu",
    Faculty: "Science",
    "First Name": "Ada",
    "Student No": "ADA001",
    Surname: "Lovelace",
    Year: "2026",
    ...overrides,
  };
}

describe("validateRows", () => {
  it("maps a valid row with no errors", () => {
    const [result] = validateRows([row()], columnMap, fieldDefinitions);

    expect(result.errors).toEqual([]);
    expect(result.studentNumber).toBe("ADA001");
    expect(result.mappedData).toEqual({
      email: "ada@example.edu",
      faculty: "Science",
      firstName: "Ada",
      lastName: "Lovelace",
      studentNumber: "ADA001",
      year: "2026",
    });
  });

  it("flags a missing required value", () => {
    const [result] = validateRows([row({ "Student No": "" })], columnMap, fieldDefinitions);

    expect(result.studentNumber).toBeNull();
    expect(result.errors).toContain('Missing value for "Student number".');
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
