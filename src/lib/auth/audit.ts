import { AuditAction } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";

type AuditMetadata = Record<string, string | number | boolean | null>;

type WriteAuditLogInput = {
  action: AuditAction;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  meta?: AuditMetadata;
  request?: Request | null;
};

function getRequestIpAddress(request?: Request | null) {
  return (
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request?.headers.get("x-real-ip") ??
    null
  );
}

export async function writeAuditLog({
  action,
  actorId = null,
  targetType = null,
  targetId = null,
  meta,
  request,
}: WriteAuditLogInput) {
  await prisma.auditLog.create({
    data: {
      action,
      actorId,
      targetType,
      targetId,
      meta,
      ipAddress: getRequestIpAddress(request),
      userAgent: request?.headers.get("user-agent") ?? null,
    },
  });
}
