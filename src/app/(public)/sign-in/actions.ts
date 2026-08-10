/**
 * @fileoverview Contains the server actions used by the `/sign-in` workflow.
 * @module app/(public)/sign-in/actions
 */

"use server";

import { headers } from "next/headers";

import { AuditAction } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { prisma } from "@/lib/db/prisma";

function getHeaderIpAddress(headerList: Headers) {
  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip") ??
    null
  );
}

export async function auditLoginFailureAction({
  email,
  code,
}: {
  email: string;
  code?: string;
}) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return;
  }

  const [headerList, user] = await Promise.all([
    headers(),
    prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        email: true,
      },
    }),
  ]);

  await writeAuditLog({
    action: AuditAction.LOGIN_FAILURE,
    actorId: user?.id ?? null,
    targetType: "user",
    targetId: user?.id ?? null,
    meta: {
      email: user?.email ?? normalizedEmail,
      code: code ?? null,
    },
    ipAddress: getHeaderIpAddress(headerList),
    userAgent: headerList.get("user-agent"),
  });
}
