import "server-only";

import type { ImportMapping } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

export type ImportFieldDefinition = {
  name: string;
  label: string;
  required: boolean;
};

/**
 * Fixed fields every university needs regardless of their credential schema:
 * a stable identifier, contact for issuance emails, and display name.
 */
export const PLATFORM_FIELDS: readonly ImportFieldDefinition[] = [
  { name: "studentNumber", label: "Student number", required: true },
  { name: "email", label: "Email", required: true },
  { name: "firstName", label: "First name", required: true },
  { name: "lastName", label: "Last name", required: true },
];

function humanizeFieldName(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  const lower = spaced.trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Builds the deduplicated list of fields the mapping UI should show: the
 * fixed platform fields plus any schema attribute not already covered by one
 * (e.g. today's schema reuses `studentNumber`/`firstName`/`lastName`, so those
 * satisfy both the platform requirement and the schema attribute with a
 * single mapped column instead of two separate rows).
 */
export function getImportFieldDefinitions(schemaAttributes: string[]): ImportFieldDefinition[] {
  const definitions = new Map<string, ImportFieldDefinition>(PLATFORM_FIELDS.map((field) => [field.name, field]));

  for (const attribute of schemaAttributes) {
    if (definitions.has(attribute)) continue;
    definitions.set(attribute, { name: attribute, label: humanizeFieldName(attribute), required: false });
  }

  return Array.from(definitions.values());
}

/**
 * Throws if any required (platform) field is missing a mapped column.
 * Schema-only fields are left for Phase 3's per-row validation.
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
 * Throws if ANY field (platform or schema) is missing a mapped column.
 * Unlike `assertRequiredFieldsMapped` (Phase 2's lighter mapping-save gate,
 * which only requires the platform fields), this is the stricter check run
 * before generating a preview — every active schema attribute needs data to
 * validate rows against, so an unmapped schema field is caught once, clearly,
 * instead of surfacing as the same "missing value" error on every row.
 */
export function assertMappingComplete(columnMap: Record<string, string>, fieldDefinitions: ImportFieldDefinition[]) {
  const missing = fieldDefinitions.filter((field) => !columnMap[field.name]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Mapping is incomplete: ${missing.map((field) => field.label).join(", ")}. Go back and finish mapping these fields before previewing.`,
    );
  }
}

/**
 * Strips an untrusted client-submitted column map down to known field names
 * with non-empty string values, dropping anything else.
 */
export function sanitizeColumnMap(input: unknown, fieldDefinitions: ImportFieldDefinition[]): Record<string, string> {
  if (!input || typeof input !== "object") {
    return {};
  }

  const validNames = new Set(fieldDefinitions.map((field) => field.name));
  const sanitized: Record<string, string> = {};

  for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
    if (!validNames.has(name) || typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) {
      sanitized[name] = trimmed;
    }
  }

  return sanitized;
}

export async function getImportMapping(universityProfileId: string): Promise<ImportMapping | null> {
  return prisma.importMapping.findUnique({ where: { universityProfileId } });
}

export async function saveImportMapping(params: {
  universityProfileId: string;
  columnMap: Record<string, string>;
  schemaVersionSnapshot: string;
}): Promise<ImportMapping> {
  return prisma.importMapping.upsert({
    create: params,
    update: {
      columnMap: params.columnMap,
      schemaVersionSnapshot: params.schemaVersionSnapshot,
    },
    where: { universityProfileId: params.universityProfileId },
  });
}
