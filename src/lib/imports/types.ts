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

/** Suggests a machine key (camelCase) from an admin-entered label, e.g. "Home Province" -> "homeProvince". Editable before submitting. */
export function slugifyToFieldKey(label: string): string {
  const words = label
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  if (words.length === 0) return "";

  const [first, ...rest] = words;
  const head = first.charAt(0).toLowerCase() + first.slice(1).toLowerCase();
  const tail = rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join("");

  return head + tail;
}
