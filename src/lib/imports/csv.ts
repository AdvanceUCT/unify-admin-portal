/**
 * @fileoverview Parses uploaded CSV files into normalized headers and row values.
 * @module lib/imports/csv
 */

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

export type ParsedCsvRows = {
  rows: Record<string, string>[];
  errors: string[];
};

/**
 * Parses the full body of a CSV file into row objects keyed by column name,
 * for validation/reconciliation. Row values are trimmed; blank lines are
 * skipped rather than surfaced as empty rows.
 */
export function parseCsvRows(text: string): ParsedCsvRows {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transform: (value) => value.trim(),
    transformHeader: (header) => header.trim(),
  });

  const errors = result.errors.map((error) => (error.row != null ? `Row ${error.row + 2}: ${error.message}` : error.message));

  return { rows: result.data, errors };
}
