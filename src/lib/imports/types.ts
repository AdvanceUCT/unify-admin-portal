// Shared, client-safe types for import preview rows — no "server-only" import,
// so both server components/routes and client components can use them.

export type ImportRowStatus = "New" | "Updated" | "Unchanged" | "Missing" | "Error";

export type ImportFieldDiff = Record<string, { old: string | null; new: string }>;

export type PreviewRow = {
  rowNumber: number | null;
  studentNumber: string | null;
  status: ImportRowStatus;
  mappedData?: Record<string, string> | null;
  errors?: string[] | null;
  diff?: ImportFieldDiff | null;
};

/** Stable React key for a row — student number when known, otherwise the row number. */
export function rowKey(row: Pick<PreviewRow, "studentNumber" | "rowNumber">): string {
  return row.studentNumber ?? `row-${row.rowNumber}`;
}
