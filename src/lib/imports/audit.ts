import "server-only";

import { AuditAction } from "@/generated/prisma/enums";
import type { AuditLogModel } from "@/generated/prisma/models";
import type { StudentImportAuditLogEntry } from "@/lib/api/types";
import { prisma } from "@/lib/db/prisma";

type ImportAuditMeta = {
  filename: string | null;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  missingCount: number;
  errorCount: number;
};

function extractImportMeta(meta: unknown): ImportAuditMeta {
  const record = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};

  const readCount = (key: keyof ImportAuditMeta) => {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };

  return {
    filename: typeof record.filename === "string" ? record.filename : null,
    newCount: readCount("newCount"),
    updatedCount: readCount("updatedCount"),
    unchangedCount: readCount("unchangedCount"),
    missingCount: readCount("missingCount"),
    errorCount: readCount("errorCount"),
  };
}

function publicStudentImportAuditLog(
  log: AuditLogModel,
  actorNamesById: Record<string, string>,
): StudentImportAuditLogEntry {
  const meta = extractImportMeta(log.meta);

  return {
    id: log.id,
    actorId: log.actorId,
    actorName: log.actorId ? (actorNamesById[log.actorId] ?? null) : null,
    createdAt: log.createdAt.toISOString(),
    ...meta,
  };
}

/**
 * Returns a paginated list of student import audit log entries.
 * The page number is clamped between 1 and the last available page so
 * out-of-range requests always return a valid result.
 *
 * @param page - The requested page number (1-indexed).
 * @param pageSize - How many entries to return per page.
 * @returns Logs for the clamped page along with total count and page metadata.
 */
export async function getPaginatedStudentImportAuditLogs({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}): Promise<{
  logs: StudentImportAuditLogEntry[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}> {
  const currentPage = Math.max(1, page);
  const take = Math.max(1, pageSize);
  const where = { action: AuditAction.STUDENT_IMPORT_COMMITTED };
  const totalCount = await prisma.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / take));
  const clampedPage = Math.min(currentPage, totalPages);
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * take,
    take,
  });

  const actorIds = [...new Set(logs.map((log) => log.actorId).filter((id): id is string => id !== null))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorNamesById = Object.fromEntries(actors.map((actor) => [actor.id, actor.name]));

  return {
    logs: logs.map((log) => publicStudentImportAuditLog(log, actorNamesById)),
    page: clampedPage,
    pageSize: take,
    totalCount,
    totalPages,
  };
}
