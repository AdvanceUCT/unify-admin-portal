import "server-only";

import { AuditAction, ImportRowStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { prisma } from "@/lib/db/prisma";
import { isSystemFieldName } from "@/lib/imports/mapping";

/** Thrown when the selected import preview cannot be found for this university. */
export class NoImportRunError extends Error {
  status = 409;
}

/** Thrown when a preview still has invalid rows that need fixing before commit. */
export class ImportRunHasErrorsError extends Error {
  status = 409;
}

function asMappedData(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, string>;
}

/** Custom-field values only — system fields are their own Student columns, not part of `attributes`. */
function customFieldValuesFrom(mappedData: Record<string, string>): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [name, value] of Object.entries(mappedData)) {
    if (!isSystemFieldName(name)) {
      attributes[name] = value;
    }
  }
  return attributes;
}

export type CommitImportRunResult = {
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  missingCount: number;
  errorCount: number;
};

/**
 * Commits a selected import preview: New rows are bulk-inserted
 * and Updated rows are bulk-updated (each in a single round trip regardless
 * of row count), matched on studentNumber. Unchanged rows are no-ops, Missing
 * rows are never touched, and Error rows block the commit so partial imports
 * cannot happen by accident.
 */
export async function commitImportRun(params: {
  universityProfileId: string;
  importRunId: string;
  actorId?: string | null;
}): Promise<CommitImportRunResult> {
  const run = await prisma.importRun.findFirst({
    include: { rows: true },
    where: { id: params.importRunId, universityProfileId: params.universityProfileId },
  });

  if (!run) {
    throw new NoImportRunError("Selected import preview was not found. Generate a preview first.");
  }

  const counts: CommitImportRunResult = {
    errorCount: run.rows.filter((row) => row.status === ImportRowStatus.ERROR).length,
    missingCount: run.rows.filter((row) => row.status === ImportRowStatus.MISSING).length,
    newCount: run.rows.filter((row) => row.status === ImportRowStatus.NEW).length,
    unchangedCount: run.rows.filter((row) => row.status === ImportRowStatus.UNCHANGED).length,
    updatedCount: run.rows.filter((row) => row.status === ImportRowStatus.UPDATED).length,
  };

  if (counts.errorCount > 0) {
    throw new ImportRunHasErrorsError("Fix or remove rows with errors before committing this import.");
  }

  const rowsToCreate = run.rows.filter((row) => row.status === ImportRowStatus.NEW && row.studentNumber);
  const rowsToUpdate = run.rows.filter((row) => row.status === ImportRowStatus.UPDATED && row.studentNumber);

  await prisma.$transaction(
    async (tx) => {
      if (rowsToCreate.length > 0) {
        await tx.student.createMany({
          data: rowsToCreate.map((row) => {
            const mappedData = asMappedData(row.mappedData);
            return {
              attributes: customFieldValuesFrom(mappedData),
              email: mappedData.email,
              faculty: mappedData.faculty,
              firstName: mappedData.firstName,
              lastName: mappedData.lastName,
              programme: mappedData.programme,
              source: "csv",
              studentNumber: row.studentNumber!,
            };
          }),
          skipDuplicates: true,
        });
      }

      if (rowsToUpdate.length > 0) {
        const studentNumbers: string[] = [];
        const emails: string[] = [];
        const firstNames: string[] = [];
        const lastNames: string[] = [];
        const faculties: string[] = [];
        const programmes: string[] = [];
        const attributesJson: string[] = [];

        for (const row of rowsToUpdate) {
          const mappedData = asMappedData(row.mappedData);
          studentNumbers.push(row.studentNumber!);
          emails.push(mappedData.email);
          firstNames.push(mappedData.firstName);
          lastNames.push(mappedData.lastName);
          faculties.push(mappedData.faculty);
          programmes.push(mappedData.programme);
          attributesJson.push(JSON.stringify(customFieldValuesFrom(mappedData)));
        }

        // Bulk update via unnest(): one round trip for every changed row, instead of
        // one upsert per row — Prisma's query builder has no bulk-update-with-per-row-values
        // primitive, so this is the standard Postgres pattern for it.
        //
        // `attributes` is merged (jsonb `||` concat), not overwritten: `v.attributes`
        // only contains custom-field keys this row actually had a value for this
        // import (validate.ts omits anything else from mappedData), so a key absent
        // from it — whether the field was removed from the template, or this file
        // simply had no column for it — is left untouched on the existing row rather
        // than silently dropped.
        await tx.$executeRaw`
          UPDATE "student" AS s
          SET
            email = v.email,
            "firstName" = v."firstName",
            "lastName" = v."lastName",
            faculty = v.faculty,
            programme = v.programme,
            attributes = COALESCE(s.attributes, '{}'::jsonb) || v.attributes,
            "updatedAt" = now()
          FROM unnest(
            ${studentNumbers}::text[],
            ${emails}::text[],
            ${firstNames}::text[],
            ${lastNames}::text[],
            ${faculties}::text[],
            ${programmes}::text[],
            ${attributesJson}::jsonb[]
          ) AS v("studentNumber", email, "firstName", "lastName", faculty, programme, attributes)
          WHERE s."studentNumber" = v."studentNumber"
        `;
      }

      await writeAuditLog(
        {
          action: AuditAction.STUDENT_IMPORT_COMMITTED,
          actorId: params.actorId,
          meta: {
            errorCount: counts.errorCount,
            filename: run.filename,
            missingCount: counts.missingCount,
            newCount: counts.newCount,
            unchangedCount: counts.unchangedCount,
            updatedCount: counts.updatedCount,
          },
          targetType: "ImportRun",
        },
        tx,
      );

      await tx.importRun.delete({ where: { id: run.id } });
    },
    { timeout: 30_000 },
  );

  return counts;
}
