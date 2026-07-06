import "server-only";

import { AuditAction, ImportRowStatus } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { prisma } from "@/lib/db/prisma";
import { PLATFORM_FIELDS } from "@/lib/imports/mapping";

/** Thrown when there is no pending import preview to commit — generate one first. */
export class NoImportRunError extends Error {
  status = 409;
}

const PLATFORM_FIELD_NAMES = new Set(PLATFORM_FIELDS.map((field) => field.name));

function asMappedData(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, string>;
}

/** Schema-attribute values only — platform fields are their own Student columns, not part of `attributes`. */
function schemaAttributesFrom(mappedData: Record<string, string>): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const [name, value] of Object.entries(mappedData)) {
    if (!PLATFORM_FIELD_NAMES.has(name)) {
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
 * Commits the university's pending import preview: New rows are bulk-inserted
 * and Updated rows are bulk-updated (each in a single round trip regardless
 * of row count), matched on studentNumber. Unchanged rows are no-ops, Missing
 * rows are never touched, and Error rows are skipped — the admin already saw
 * exactly which rows had errors in the preview. The staged run is deleted
 * afterward (transient staging, not history); the only lasting trace is a
 * single audit log entry with the counts.
 */
export async function commitImportRun(params: {
  universityProfileId: string;
  actorId?: string | null;
}): Promise<CommitImportRunResult> {
  const run = await prisma.importRun.findUnique({
    include: { rows: true },
    where: { universityProfileId: params.universityProfileId },
  });

  if (!run) {
    throw new NoImportRunError("No pending import preview to commit. Generate a preview first.");
  }

  const counts: CommitImportRunResult = {
    errorCount: run.rows.filter((row) => row.status === ImportRowStatus.ERROR).length,
    missingCount: run.rows.filter((row) => row.status === ImportRowStatus.MISSING).length,
    newCount: run.rows.filter((row) => row.status === ImportRowStatus.NEW).length,
    unchangedCount: run.rows.filter((row) => row.status === ImportRowStatus.UNCHANGED).length,
    updatedCount: run.rows.filter((row) => row.status === ImportRowStatus.UPDATED).length,
  };
  const rowsToCreate = run.rows.filter((row) => row.status === ImportRowStatus.NEW && row.studentNumber);
  const rowsToUpdate = run.rows.filter((row) => row.status === ImportRowStatus.UPDATED && row.studentNumber);

  await prisma.$transaction(
    async (tx) => {
      if (rowsToCreate.length > 0) {
        await tx.student.createMany({
          data: rowsToCreate.map((row) => {
            const mappedData = asMappedData(row.mappedData);
            return {
              attributes: schemaAttributesFrom(mappedData),
              email: mappedData.email,
              firstName: mappedData.firstName,
              lastName: mappedData.lastName,
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
        const attributesJson: string[] = [];

        for (const row of rowsToUpdate) {
          const mappedData = asMappedData(row.mappedData);
          studentNumbers.push(row.studentNumber!);
          emails.push(mappedData.email);
          firstNames.push(mappedData.firstName);
          lastNames.push(mappedData.lastName);
          attributesJson.push(JSON.stringify(schemaAttributesFrom(mappedData)));
        }

        // Bulk update via unnest(): one round trip for every changed row, instead of
        // one upsert per row — Prisma's query builder has no bulk-update-with-per-row-values
        // primitive, so this is the standard Postgres pattern for it.
        await tx.$executeRaw`
          UPDATE "student" AS s
          SET
            email = v.email,
            "firstName" = v."firstName",
            "lastName" = v."lastName",
            attributes = v.attributes,
            "updatedAt" = now()
          FROM unnest(
            ${studentNumbers}::text[],
            ${emails}::text[],
            ${firstNames}::text[],
            ${lastNames}::text[],
            ${attributesJson}::jsonb[]
          ) AS v("studentNumber", email, "firstName", "lastName", attributes)
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
