/**
 * @fileoverview Classifies imported students as new, changed, unchanged, or invalid.
 * @module lib/imports/reconcile
 */

import "server-only";

import type { Student } from "@/generated/prisma/client";
import type { ImportFieldDefinition } from "@/lib/imports/mapping";
import type { ImportFieldDiff, PreviewRow } from "@/lib/imports/types";
import type { ValidatedImportRow } from "@/lib/imports/validate";

export type { ImportRowStatus } from "@/lib/imports/types";
export type ReconciledImportRow = PreviewRow;

function currentValueFor(student: Student, fieldName: string): string | null {
  switch (fieldName) {
    case "studentNumber":
      return student.studentNumber;
    case "email":
      return student.email;
    case "firstName":
      return student.firstName;
    case "lastName":
      return student.lastName;
    case "faculty":
      return student.faculty;
    case "programme":
      return student.programme;
    default: {
      const attributes = student.attributes;
      if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
        return null;
      }
      const value = (attributes as Record<string, unknown>)[fieldName];
      return typeof value === "string" ? value : value == null ? null : String(value);
    }
  }
}

/** All of a student's current field values, keyed by field name — used to show full data for Missing rows, which have no CSV row of their own. */
function existingStudentAsMappedData(student: Student, fieldDefinitions: ImportFieldDefinition[]): Record<string, string> {
  const mappedData: Record<string, string> = {};

  for (const field of fieldDefinitions) {
    const value = currentValueFor(student, field.name);
    if (value != null) {
      mappedData[field.name] = value;
    }
  }

  return mappedData;
}

function diffAgainstExisting(mappedData: Record<string, string>, existing: Student): ImportFieldDiff {
  const diff: ImportFieldDiff = {};

  for (const [fieldName, newValue] of Object.entries(mappedData)) {
    if (fieldName === "studentNumber") continue; // the match key, never itself a diffed field
    const oldValue = currentValueFor(existing, fieldName);
    if (oldValue !== newValue) {
      diff[fieldName] = { new: newValue, old: oldValue };
    }
  }

  return diff;
}

/**
 * Classifies each validated row as New/Updated/Unchanged/Error, and appends
 * Missing rows for existing students absent from the uploaded file. Never
 * mutates or deletes anything — this is read-only reconciliation for preview.
 */
export function reconcileRows(
  validatedRows: ValidatedImportRow[],
  existingStudents: Student[],
  fieldDefinitions: ImportFieldDefinition[],
): ReconciledImportRow[] {
  const existingByStudentNumber = new Map(existingStudents.map((student) => [student.studentNumber, student]));
  const incomingStudentNumbers = new Set<string>();
  const rows: ReconciledImportRow[] = [];

  for (const row of validatedRows) {
    if (row.studentNumber) {
      incomingStudentNumbers.add(row.studentNumber);
    }

    if (row.errors.length > 0) {
      rows.push({
        errors: row.errors,
        mappedData: row.mappedData,
        rowNumber: row.rowNumber,
        status: "Error",
        studentNumber: row.studentNumber,
      });
      continue;
    }

    const existing = row.studentNumber ? existingByStudentNumber.get(row.studentNumber) : undefined;

    if (!existing) {
      rows.push({
        mappedData: row.mappedData,
        rowNumber: row.rowNumber,
        status: "New",
        studentNumber: row.studentNumber,
      });
      continue;
    }

    const diff = diffAgainstExisting(row.mappedData, existing);
    const hasChanges = Object.keys(diff).length > 0;

    rows.push({
      diff: hasChanges ? diff : undefined,
      mappedData: row.mappedData,
      rowNumber: row.rowNumber,
      status: hasChanges ? "Updated" : "Unchanged",
      studentNumber: row.studentNumber,
    });
  }

  for (const student of existingStudents) {
    if (!incomingStudentNumbers.has(student.studentNumber)) {
      rows.push({
        mappedData: existingStudentAsMappedData(student, fieldDefinitions),
        rowNumber: null,
        status: "Missing",
        studentNumber: student.studentNumber,
      });
    }
  }

  return rows;
}
