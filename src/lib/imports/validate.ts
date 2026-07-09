import "server-only";

import type { ImportFieldDefinition } from "@/lib/imports/mapping";

export type ValidatedImportRow = {
  rowNumber: number;
  studentNumber: string | null;
  mappedData: Record<string, string>;
  errors: string[];
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(email);
}

/**
 * Maps one raw CSV row through the column mapping and validates it. A field
 * is hard-required per row exactly when `field.required` is true — that's
 * every system field, and every currently-active custom field (an active
 * custom field is a live commitment to track that data, so it's required
 * throughout the import process, same as a system field). The only way a
 * custom field stops being required is falling out of `fieldDefinitions`
 * entirely by being removed from the template via Manage Fields — at that
 * point it's not validated, not diffed, and not written on commit for future
 * imports, though `commit.ts`'s merge-not-overwrite update still leaves any
 * value already stored under that key on existing students untouched.
 */
function validateRow(
  rawRow: Record<string, string>,
  rowNumber: number,
  columnMap: Record<string, string>,
  fieldDefinitions: ImportFieldDefinition[],
): ValidatedImportRow {
  const mappedData: Record<string, string> = {};
  const errors: string[] = [];

  for (const field of fieldDefinitions) {
    const column = columnMap[field.name];
    const value = column ? (rawRow[column] ?? "").trim() : "";

    if (value) {
      mappedData[field.name] = value;
    } else if (field.required) {
      errors.push(`Missing value for "${field.label}".`);
    }
  }

  if (mappedData.email && !isValidEmail(mappedData.email)) {
    errors.push(`Invalid email address "${mappedData.email}".`);
  }

  return {
    errors,
    mappedData,
    rowNumber,
    studentNumber: mappedData.studentNumber ?? null,
  };
}

/**
 * Validates every row, then flags duplicate student numbers within the file
 * — a cross-row check that can only run once every row has been mapped.
 */
export function validateRows(
  rawRows: Record<string, string>[],
  columnMap: Record<string, string>,
  fieldDefinitions: ImportFieldDefinition[],
): ValidatedImportRow[] {
  const rows = rawRows.map((rawRow, index) => validateRow(rawRow, index + 2, columnMap, fieldDefinitions));

  const rowsByStudentNumber = new Map<string, ValidatedImportRow[]>();
  for (const row of rows) {
    if (!row.studentNumber) continue;
    const group = rowsByStudentNumber.get(row.studentNumber) ?? [];
    group.push(row);
    rowsByStudentNumber.set(row.studentNumber, group);
  }

  for (const group of rowsByStudentNumber.values()) {
    if (group.length <= 1) continue;
    for (const row of group) {
      row.errors.push(`Duplicate student number "${row.studentNumber}" appears in ${group.length} rows of this file.`);
    }
  }

  return rows;
}
