/**
 * @fileoverview Loads administrator and vendor sessions and applies route-specific access requirements.
 * @module lib/auth/session
 */

import "server-only";

import { forbidden, redirect } from "next/navigation";
import { headers } from "next/headers";

import { VendorApplicationStatus } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth/auth";
import {
  assertRole,
  isAdminRole,
  type AdminRole,
  type SessionWithRole,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

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
 * A signed-in vendor is redirected to `/vendor` rather than shown a 403, since
 * the admin portal and vendor portal are different sections, not access levels.
 */
export async function requireAdminSession() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/sign-in");
  }

  if (session.user.userType !== "ADMIN") {
    redirect("/vendor");
  }

  return session;
}

/**
 * Gets the current vendor session without redirecting, for callers that need
 * to branch on whether a vendor is signed in (e.g. the vendor sign-in page).
 */
export async function getCurrentVendorSession() {
  return getCurrentAdminSession();
}

/**
 * Gets the current session or redirects to `/vendor/sign-in` if there isn't
 * one. A signed-in admin is redirected to `/` rather than shown a 403, since
 * the vendor portal and admin portal are different sections, not access levels.
 */
export async function requireVendorSession() {
  const session = await getCurrentVendorSession();

  if (!session) {
    redirect("/vendor/sign-in");
  }

  if (session.user.userType !== "VENDOR") {
    redirect("/");
  }

  return session;
}

/**
 * Like requireVendorSession, but also verifies the vendor has a currently
 * APPROVED application. Use this on routes where access should be blocked
 * after revocation — not on the application-status pages that all vendors
 * need to view regardless of approval state.
 */
export async function requireApprovedVendorSession() {
  const session = await requireVendorSession();

  const approvedApplication = await prisma.vendorApplication.findFirst({
    where: {
      vendorProfile: { userId: session.user.id },
      status: VendorApplicationStatus.APPROVED,
    },
    select: { id: true },
  });

  if (!approvedApplication) {
    forbidden();
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
