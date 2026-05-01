import "server-only";

import { forbidden, redirect } from "next/navigation";
import { headers } from "next/headers";

import { auth } from "@/lib/auth/auth";
import {
  assertRole,
  isAdminRole,
  type AdminRole,
  type SessionWithRole,
} from "@/lib/auth/permissions";

export type AdminSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

export async function getCurrentAdminSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session;
}

export async function requireAdminSession() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/sign-in");
  }

  return session;
}

export async function requireRole(allowedRoles: readonly AdminRole[]) {
  const session = await requireAdminSession();

  try {
    assertRole(session as SessionWithRole, allowedRoles);
  } catch {
    forbidden();
  }

  return session;
}

export async function getSessionForAudit() {
  const [session, requestHeaders] = await Promise.all([
    getCurrentAdminSession(),
    headers(),
  ]);
  const role = session?.user.role;

  return {
    actorId: session?.user.id ?? null,
    role: isAdminRole(role) ? role : null,
    ipAddress:
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      requestHeaders.get("x-real-ip"),
    userAgent: requestHeaders.get("user-agent"),
  };
}
