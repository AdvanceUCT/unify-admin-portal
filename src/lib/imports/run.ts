/**
 * @fileoverview Tracks the state and summary of a student import run.
 * @module lib/imports/run
 */

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

/** Stores a pending import preview. Commit must name the returned run id. */
/** Stores a bounded import preview so the later commit uses the reviewed row set. */
export async function saveImportPreview(params: {
  universityProfileId: string;
  filename: string;
  mappingSnapshot: Record<string, string>;
  rows: ReconciledImportRow[];
}) {
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
