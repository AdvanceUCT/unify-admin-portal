import { describe, expect, it, vi } from "vitest";

import type { Student } from "@/generated/prisma/client";
import { getImportFieldDefinitions } from "@/lib/imports/mapping";
import { reconcileRows } from "@/lib/imports/reconcile";
import type { ValidatedImportRow } from "@/lib/imports/validate";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {},
}));

const fieldDefinitions = getImportFieldDefinitions(["studentNumber", "firstName", "lastName", "faculty", "year"]);

function student(overrides: Partial<Student> = {}): Student {
  return {
    attributes: { faculty: "Science", year: "2026" },
    createdAt: new Date("2026-01-01"),
    email: "ada@example.edu",
    firstName: "Ada",
    id: "student-1",
    lastName: "Lovelace",
    source: "csv",
    studentNumber: "ADA001",
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function validRow(overrides: Partial<ValidatedImportRow> = {}): ValidatedImportRow {
  return {
    errors: [],
    mappedData: {
      email: "ada@example.edu",
      faculty: "Science",
      firstName: "Ada",
      lastName: "Lovelace",
      studentNumber: "ADA001",
      year: "2026",
    },
    rowNumber: 2,
    studentNumber: "ADA001",
    ...overrides,
  };
}

describe("reconcileRows", () => {
  it("classifies a row with no matching student as New", () => {
    const [result] = reconcileRows([validRow()], [], fieldDefinitions);

    expect(result.status).toBe("New");
    expect(result.diff).toBeUndefined();
  });

  it("classifies an identical row against an existing student as Unchanged", () => {
    const [result] = reconcileRows([validRow()], [student()], fieldDefinitions);

    expect(result.status).toBe("Unchanged");
    expect(result.diff).toBeUndefined();
  });

  it("classifies a row with a changed field as Updated, with a diff of only the changed fields", () => {
    const [result] = reconcileRows(
      [validRow({ mappedData: { ...validRow().mappedData, faculty: "Engineering" } })],
      [student()],
      fieldDefinitions,
    );

    expect(result.status).toBe("Updated");
    expect(result.diff).toEqual({ faculty: { new: "Engineering", old: "Science" } });
  });

  it("never includes studentNumber itself in the diff", () => {
    const [result] = reconcileRows(
      [validRow({ mappedData: { ...validRow().mappedData, faculty: "Engineering" } })],
      [student()],
      fieldDefinitions,
    );

    expect(result.diff).not.toHaveProperty("studentNumber");
  });

  it("carries errored rows through as Error regardless of DB state", () => {
    const [result] = reconcileRows(
      [validRow({ errors: ["Invalid email address."], studentNumber: "ADA001" })],
      [student()],
      fieldDefinitions,
    );

    expect(result.status).toBe("Error");
    expect(result.errors).toEqual(["Invalid email address."]);
  });

  it("flags an existing student absent from the file as Missing, without mutating it, and includes their current data", () => {
    const results = reconcileRows(
      [],
      [student(), student({ email: "bob@example.edu", firstName: "Bob", id: "student-2", lastName: "Marley", studentNumber: "BOB002" })],
      fieldDefinitions,
    );

    expect(results).toHaveLength(2);
    expect(results.every((row) => row.status === "Missing")).toBe(true);
    expect(results.map((row) => row.studentNumber).sort()).toEqual(["ADA001", "BOB002"]);
    expect(results.every((row) => row.rowNumber === null)).toBe(true);

    const ada = results.find((row) => row.studentNumber === "ADA001");
    expect(ada?.mappedData).toEqual({
      email: "ada@example.edu",
      faculty: "Science",
      firstName: "Ada",
      lastName: "Lovelace",
      studentNumber: "ADA001",
      year: "2026",
    });
  });

  it("does not flag a student as Missing when they are present in the file", () => {
    const results = reconcileRows([validRow()], [student()], fieldDefinitions);

    expect(results.filter((row) => row.status === "Missing")).toHaveLength(0);
  });
});
