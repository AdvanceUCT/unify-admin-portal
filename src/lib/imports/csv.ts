import "server-only";

import Papa from "papaparse";

export type ParsedCsvHeader = {
  columns: string[];
  errors: string[];
};

/**
 * Reads just the header row of a CSV file. Used to render the column-mapping
 * step without needing to hold the full parsed file anywhere — Phase 2 only
 * needs the column names, not the row data.
 */
export function parseCsvHeader(text: string): ParsedCsvHeader {
  const result = Papa.parse<string[]>(text, {
    header: false,
    preview: 1,
    skipEmptyLines: true,
  });

  const errors = result.errors.map((error) => error.message);
  const columns = (result.data[0] ?? []).map((column) => column.trim()).filter((column) => column.length > 0);

  return { columns, errors };
}
