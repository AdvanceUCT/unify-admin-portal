import { NextResponse } from "next/server";

import { assertCan, PermissionError, type SessionWithRole } from "@/lib/auth/permissions";
import { getCurrentAdminSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { parseCsvRows } from "@/lib/imports/csv";
import { assertMappingComplete, getImportFieldDefinitions, getImportMapping } from "@/lib/imports/mapping";
import { reconcileRows, type ReconciledImportRow } from "@/lib/imports/reconcile";
import { saveImportPreview } from "@/lib/imports/run";
import { validateRows } from "@/lib/imports/validate";
import { getActiveCredentialSchema } from "@/lib/university/credentialSchema";
import { getUniversityProfile } from "@/lib/university/profile";

/** Thrown when the university hasn't finished setup or saved a mapping yet, so there's nothing to preview against. */
class ImportNotConfiguredError extends Error {
  status = 409;
}

function countBy(rows: ReconciledImportRow[]) {
  return {
    error: rows.filter((row) => row.status === "Error").length,
    missing: rows.filter((row) => row.status === "Missing").length,
    new: rows.filter((row) => row.status === "New").length,
    unchanged: rows.filter((row) => row.status === "Unchanged").length,
    updated: rows.filter((row) => row.status === "Updated").length,
  };
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
    const profile = await getUniversityProfile();
    if (!profile) {
      throw new ImportNotConfiguredError("University profile has not been configured.");
    }

    const schema = await getActiveCredentialSchema(profile.id);
    if (!schema) {
      throw new ImportNotConfiguredError("Active credential schema was not found.");
    }

    const savedMapping = await getImportMapping(profile.id);
    if (!savedMapping) {
      throw new ImportNotConfiguredError("Save a column mapping before generating a preview.");
    }

    const fieldDefinitions = getImportFieldDefinitions(schema.schemaAttributes);
    const columnMap = savedMapping.columnMap as Record<string, string>;

    try {
      assertMappingComplete(columnMap, fieldDefinitions);
    } catch (error) {
      throw new ImportNotConfiguredError(error instanceof Error ? error.message : "Mapping is incomplete.");
    }

    const formData = await request.formData().catch(() => undefined);
    const file = formData?.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: { message: "A CSV file is required." } }, { status: 400 });
    }

    const text = await file.text();
    const { rows: rawRows, errors: fileErrors } = parseCsvRows(text);

    if (rawRows.length === 0) {
      return NextResponse.json({ error: { message: "The uploaded file has no data rows." } }, { status: 400 });
    }

    const validatedRows = validateRows(rawRows, columnMap, fieldDefinitions);
    const existingStudents = await prisma.student.findMany();
    const reconciledRows = reconcileRows(validatedRows, existingStudents, fieldDefinitions);

    await saveImportPreview({
      filename: file.name,
      mappingSnapshot: columnMap,
      rows: reconciledRows,
      universityProfileId: profile.id,
    });

    return NextResponse.json({
      counts: countBy(reconciledRows),
      fileErrors: fileErrors.length > 0 ? fileErrors : undefined,
      filename: file.name,
      rows: reconciledRows,
    });
  } catch (error) {
    const status = error instanceof ImportNotConfiguredError ? error.status : 400;
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Failed to generate import preview." } },
      { status },
    );
  }
}
