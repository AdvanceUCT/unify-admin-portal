/**
 * @fileoverview Maps source roster columns onto required and custom student fields.
 * @module lib/imports/mapping
 */

import "server-only";

import type { ImportMapping } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export type ImportFieldDefinition = {
  name: string;
  label: string;
  required: boolean;
  kind: "system" | "custom";
};

/**
 * Fixed fields every university needs, cannot rename or remove: a stable
 * identifier, contact for issuance emails, display name, and the two fields
 * used for filtering/segmentation in batch operations. Independent of
 * `CredentialSchema.schemaAttributes` — see `getImportFieldDefinitions`.
 */
export const SYSTEM_FIELDS: readonly ImportFieldDefinition[] = [
  { kind: "system", label: "Student number", name: "studentNumber", required: true },
  { kind: "system", label: "Email", name: "email", required: true },
  { kind: "system", label: "First name", name: "firstName", required: true },
  { kind: "system", label: "Last name", name: "lastName", required: true },
  { kind: "system", label: "Faculty", name: "faculty", required: true },
  { kind: "system", label: "Programme", name: "programme", required: true },
];

const SYSTEM_FIELD_NAMES = new Set(SYSTEM_FIELDS.map((field) => field.name));

export function isSystemFieldName(name: string): boolean {
  return SYSTEM_FIELD_NAMES.has(name);
}

/** Turns a machine key like `homeProvince` or `home_province` into "Home province". */
export function humanizeFieldName(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  const lower = spaced.trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Builds the deduplicated list of fields the mapping UI should show: the
 * fixed system fields plus the university's active (non-removed) custom
 * fields. Deliberately independent of `CredentialSchema.schemaAttributes` —
 * custom fields are admin-defined per university, not derived from the
 * credential schema (see `isRequiredByActiveSchema` for the one place this
 * refactor still reads schema attributes, as a removal-safety check only).
 *
 * Custom fields are `required: true`, same as system fields: since they can
 * now only be created via the Manage Fields screen (not ad hoc during an
 * import), a field existing in the template means the university has
 * committed to tracking it — every subsequent import must map and populate
 * it, exactly like a system field.
 */
export function getImportFieldDefinitions(
  customFields: { key: string; label: string }[],
): ImportFieldDefinition[] {
  const definitions = new Map<string, ImportFieldDefinition>(SYSTEM_FIELDS.map((field) => [field.name, field]));

  for (const { key, label } of customFields) {
    if (definitions.has(key)) continue;
    definitions.set(key, { kind: "custom", label, name: key, required: true });
  }

  return Array.from(definitions.values());
}

/**
 * Throws if any required field — system or custom, both are required now —
 * is missing a mapped column. This is the completeness gate used both at
 * mapping-save time and before generating a preview.
 */
export function assertRequiredFieldsMapped(
  columnMap: Record<string, string>,
  fieldDefinitions: ImportFieldDefinition[],
) {
  const missing = fieldDefinitions.filter((field) => field.required && !columnMap[field.name]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing required field mapping for: ${missing.map((field) => field.label).join(", ")}.`);
  }
}

/**
 * Returns true when `key` is one of the active credential schema's required
 * attributes — used only to warn before removing a custom field that
 * issuance currently depends on by name. Does not otherwise couple the
 * mapping field list back to the credential schema.
 */
export function isRequiredByActiveSchema(key: string, schemaAttributes: string[]): boolean {
  return schemaAttributes.includes(key);
}

export type MappingAssignment = { fieldName: string; csvColumn: string };

/**
 * Validates an untrusted client-submitted assignment list down to known
 * field names with non-empty string columns, dropping anything else. An
 * array (not a `Record`) at this boundary is what makes "two columns
 * claiming the same field" representable long enough to reject in
 * `assertNoDuplicateMappingTargets` — a plain object can't hold two values
 * under one key, so collapsing to one client-side would erase the conflict
 * before it's checkable.
 */
export function parseMappingAssignments(
  input: unknown,
  fieldDefinitions: ImportFieldDefinition[],
): MappingAssignment[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const validNames = new Set(fieldDefinitions.map((field) => field.name));
  const assignments: MappingAssignment[] = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const fieldName = (entry as { fieldName?: unknown }).fieldName;
    const csvColumn = (entry as { csvColumn?: unknown }).csvColumn;

    if (typeof fieldName !== "string" || !validNames.has(fieldName)) continue;
    if (typeof csvColumn !== "string") continue;

    const trimmed = csvColumn.trim();
    if (trimmed) {
      assignments.push({ csvColumn: trimmed, fieldName });
    }
  }

  return assignments;
}

/** Throws, naming the conflicting columns and the shared field, if the same field is assigned more than once. */
export function assertNoDuplicateMappingTargets(assignments: MappingAssignment[]) {
  const columnsByField = new Map<string, string[]>();

  for (const { fieldName, csvColumn } of assignments) {
    const columns = columnsByField.get(fieldName) ?? [];
    columns.push(csvColumn);
    columnsByField.set(fieldName, columns);
  }

  for (const [fieldName, columns] of columnsByField) {
    if (columns.length > 1) {
      throw new Error(
        `Columns ${columns.map((column) => `"${column}"`).join(", ")} are both mapped to "${fieldName}". Map each field to only one column.`,
      );
    }
  }
}

/** Throws, naming the shared column and the conflicting fields, if the same column is assigned to more than one field. */
export function assertNoSharedColumns(assignments: MappingAssignment[]) {
  const fieldsByColumn = new Map<string, string[]>();

  for (const { fieldName, csvColumn } of assignments) {
    const fields = fieldsByColumn.get(csvColumn) ?? [];
    fields.push(fieldName);
    fieldsByColumn.set(csvColumn, fields);
  }

  for (const [csvColumn, fields] of fieldsByColumn) {
    if (fields.length > 1) {
      throw new Error(
        `Column "${csvColumn}" is mapped to more than one field (${fields.map((field) => `"${field}"`).join(", ")}). Map each column to only one field.`,
      );
    }
  }
}

export function assignmentsToColumnMap(assignments: MappingAssignment[]): Record<string, string> {
  const columnMap: Record<string, string> = {};
  for (const { fieldName, csvColumn } of assignments) {
    columnMap[fieldName] = csvColumn;
  }
  return columnMap;
}

export async function getImportMapping(universityProfileId: string): Promise<ImportMapping | null> {
  return prisma.importMapping.findUnique({ where: { universityProfileId } });
}

export async function saveImportMapping(params: {
  universityProfileId: string;
  columnMap: Record<string, string>;
}): Promise<ImportMapping> {
  return prisma.importMapping.upsert({
    create: params,
    update: { columnMap: params.columnMap },
    where: { universityProfileId: params.universityProfileId },
  });
}
