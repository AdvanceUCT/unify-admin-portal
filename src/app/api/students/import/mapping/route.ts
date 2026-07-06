import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import {
  assertRequiredFieldsMapped,
  getImportFieldDefinitions,
  getImportMapping,
  sanitizeColumnMap,
  saveImportMapping,
} from "@/lib/imports/mapping";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";

/** Thrown when the university hasn't finished setup yet, so CSV import has nothing to map against. */
class ImportNotConfiguredError extends Error {
  status = 409;
}

async function loadFieldDefinitions() {
  const profile = await getUniversityProfile();

  if (!profile) {
    throw new ImportNotConfiguredError("University profile has not been configured.");
  }

  const schema = await getActiveCredentialSchema(profile.id);

  if (!schema) {
    throw new ImportNotConfiguredError("Active credential schema was not found.");
  }

  return { fieldDefinitions: getImportFieldDefinitions(schema.schemaAttributes), profile, schema };
}

export async function GET() {
  const session = await getCurrentAdminSession();

  try {
    assertCan("student:read", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized CSV import request." } }, { status });
  }

  try {
    const { fieldDefinitions, profile } = await loadFieldDefinitions();
    const existingMapping = await getImportMapping(profile.id);

    return NextResponse.json({
      columnMap: (existingMapping?.columnMap as Record<string, string> | undefined) ?? {},
      fieldDefinitions,
    });
  } catch (error) {
    const status = error instanceof ImportNotConfiguredError ? error.status : 500;
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Failed to load import mapping." } },
      { status },
    );
  }
}

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();

  try {
    assertCan("student:write", session as SessionWithRole);
  } catch (error) {
    const status = error instanceof PermissionError ? error.status : 401;
    return NextResponse.json({ error: { message: "Unauthorized CSV import request." } }, { status });
  }

  try {
    const { fieldDefinitions, profile, schema } = await loadFieldDefinitions();
    const body = (await request.json().catch(() => undefined)) as { columnMap?: unknown } | undefined;
    const columnMap = sanitizeColumnMap(body?.columnMap, fieldDefinitions);

    assertRequiredFieldsMapped(columnMap, fieldDefinitions);

    const saved = await saveImportMapping({
      columnMap,
      schemaVersionSnapshot: `${schema.schemaName}@${schema.schemaVersion}`,
      universityProfileId: profile.id,
    });

    return NextResponse.json({ columnMap: saved.columnMap });
  } catch (error) {
    const status = error instanceof ImportNotConfiguredError ? error.status : 400;
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Failed to save import mapping." } },
      { status },
    );
  }
}
