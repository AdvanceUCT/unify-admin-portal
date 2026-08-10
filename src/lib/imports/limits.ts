/**
 * @fileoverview Keeps roster uploads and previews within documented row and file-size limits.
 * @module lib/imports/limits
 */

export const MAX_CSV_FILE_SIZE_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 5000;

export function csvFileTooLargeMessage() {
  return "CSV file is too large. Upload a file smaller than 2 MB.";
}

export function csvRowLimitMessage() {
  return `CSV imports are limited to ${MAX_CSV_ROWS} data rows.`;
}
