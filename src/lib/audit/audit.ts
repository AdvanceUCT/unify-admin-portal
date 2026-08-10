/**
 * @fileoverview Writes administrator activity to the portal audit log.
 * @module lib/audit/audit
 */

import { AuditAction } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

type AuditMetadata = Record<string, string | number | boolean | null>;

type WriteAuditLogInput = {
  action: AuditAction;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  meta?: AuditMetadata;
  ipAddress?: string | null;
  userAgent?: string | null;
  request?: Request | null;
};

function getRequestIpAddress(request?: Request | null) {
  return (
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request?.headers.get("x-real-ip") ??
    null
  );
}

export async function writeAuditLog(
  {
    action,
    actorId = null,
    targetType = null,
    targetId = null,
    meta,
    ipAddress,
    userAgent,
    request,
  }: WriteAuditLogInput,
  database: Pick<Prisma.TransactionClient, "auditLog"> = prisma,
) {
  await database.auditLog.create({
    data: {
      action,
      actorId,
      targetType,
      targetId,
      meta,
      ipAddress: ipAddress ?? getRequestIpAddress(request),
      userAgent: userAgent ?? request?.headers.get("user-agent") ?? null,
    },
  });
}
