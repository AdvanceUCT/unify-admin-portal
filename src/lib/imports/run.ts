import "server-only";

import { ImportRowStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import type { ReconciledImportRow } from "@/lib/imports/reconcile";

const STATUS_MAP: Record<ReconciledImportRow["status"], ImportRowStatus> = {
  Error: ImportRowStatus.ERROR,
  Missing: ImportRowStatus.MISSING,
  New: ImportRowStatus.NEW,
  Unchanged: ImportRowStatus.UNCHANGED,
  Updated: ImportRowStatus.UPDATED,
};

/**
 * Replaces the university's single pending import preview wholesale — this
 * is transient staging (not history), so any existing run is discarded first.
 */
export async function saveImportPreview(params: {
  universityProfileId: string;
  filename: string;
  mappingSnapshot: Record<string, string>;
  rows: ReconciledImportRow[];
}) {
  await prisma.importRun.deleteMany({ where: { universityProfileId: params.universityProfileId } });

  return prisma.importRun.create({
    data: {
      filename: params.filename,
      mappingSnapshot: params.mappingSnapshot,
      rows: {
        createMany: {
          data: params.rows.map((row) => ({
            diff: row.diff ?? undefined,
            errors: row.errors ?? undefined,
            mappedData: row.mappedData ?? undefined,
            rowNumber: row.rowNumber,
            status: STATUS_MAP[row.status],
            studentNumber: row.studentNumber,
          })),
        },
      },
      universityProfileId: params.universityProfileId,
    },
    include: { rows: true },
  });
}
