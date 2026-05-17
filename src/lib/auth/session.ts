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

/**
 * Gets the current session or redirects to `/sign-in` if there isn't one.
 * Use this in server components or route handlers that require authentication.
 */
export async function requireAdminSession() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/sign-in");
  }

  return session;
}

/**
 * Requires an authenticated session with one of the given roles.
 * Calls Next.js `forbidden()` (returning a 403) if the role doesn't match,
 * so the caller never needs to handle the unauthorised case explicitly.
 *
 * @param allowedRoles - The roles permitted to proceed.
 * @returns The current session if the role check passes.
 */
export async function requireRole(allowedRoles: readonly AdminRole[]) {
  const session = await requireAdminSession();

  try {
    assertRole(session as SessionWithRole, allowedRoles);
  } catch {
    forbidden();
  }

  return session;
}

/**
 * Returns the current user and request context needed to write an audit log entry.
 * Takes the first IP from `x-forwarded-for` (in case of multiple proxies) and
 * falls back to `x-real-ip` if that header isn't present.
 */
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
