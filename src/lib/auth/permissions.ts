import { defaultAc, userAc } from "better-auth/plugins/admin/access";

import { ADMIN_ROLES, type AdminRole } from "@/lib/auth/roles";

export {
  ADMIN_ROLES,
  INVITABLE_ADMIN_ROLES,
  ROLE_LABELS,
  type AdminRole,
} from "@/lib/auth/roles";

type RoleRoute = {
  prefix: string;
  allowedRoles: readonly AdminRole[];
  exact?: boolean;
};

export const ROLE_ROUTE_MAP: readonly RoleRoute[] = [
  {
    prefix: "/credentials",
    allowedRoles: ["SUPER_ADMIN", "ADMIN", "ISSUER"],
  },
  {
    prefix: "/students",
    allowedRoles: ["SUPER_ADMIN", "ADMIN", "ISSUER"],
  },
  {
    prefix: "/vendors",
    allowedRoles: ["SUPER_ADMIN", "ADMIN"],
  },
  {
    prefix: "/audit",
    allowedRoles: ["SUPER_ADMIN", "ADMIN", "VIEWER"],
  },
  {
    prefix: "/users",
    allowedRoles: ["SUPER_ADMIN"],
  },
  {
    prefix: "/settings",
    allowedRoles: ADMIN_ROLES,
  },
  {
    prefix: "/",
    allowedRoles: ["SUPER_ADMIN", "ADMIN", "ISSUER", "VIEWER"],
    exact: true,
  },
];

export const ADMIN_ACTIONS = [
  "credential:read",
  "credential:write",
  "credential:schema:manage",
  "student:read",
  "student:write",
  "vendor:read",
  "vendor:write",
  "rule:read",
  "rule:write",
  "audit:read",
  "user:invite",
  "user:deactivate",
  "user:reactivate",
  "user:change-role",
  "session:revoke",
] as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[number];

const ACTION_ROLE_MAP: Record<AdminAction, readonly AdminRole[]> = {
  "credential:read": ["SUPER_ADMIN", "ADMIN", "ISSUER", "VIEWER"],
  "credential:write": ["SUPER_ADMIN", "ADMIN", "ISSUER"],
  "credential:schema:manage": ["SUPER_ADMIN", "ADMIN"],
  "student:read": ["SUPER_ADMIN", "ADMIN", "ISSUER", "VIEWER"],
  "student:write": ["SUPER_ADMIN", "ADMIN", "ISSUER"],
  "vendor:read": ["SUPER_ADMIN", "ADMIN", "VIEWER"],
  "vendor:write": ["SUPER_ADMIN", "ADMIN"],
  "rule:read": ["SUPER_ADMIN", "ADMIN", "VIEWER"],
  "rule:write": ["SUPER_ADMIN", "ADMIN"],
  "audit:read": ["SUPER_ADMIN", "ADMIN", "VIEWER"],
  "user:invite": ["SUPER_ADMIN"],
  "user:deactivate": ["SUPER_ADMIN"],
  "user:reactivate": ["SUPER_ADMIN"],
  "user:change-role": ["SUPER_ADMIN"],
  "session:revoke": ["SUPER_ADMIN"],
};

export const superAdminAccess = defaultAc.newRole({
  user: ["create", "list", "set-role", "ban", "delete", "set-password", "get", "update"],
  session: ["list", "revoke", "delete"],
});

/**
 * Role definitions passed to the BetterAuth admin plugin.
 * `SUPER_ADMIN` gets full user and session management access. All other roles
 * use `userAc` (read-only user access) since we enforce finer permissions
 * ourselves via `ACTION_ROLE_MAP` and `assertCan`.
 */
export const betterAuthAdminRoles = {
  SUPER_ADMIN: superAdminAccess,
  ADMIN: userAc,
  ISSUER: userAc,
  VIEWER: userAc,
} as const;

/**
 * Thrown when a role check fails on the server side.
 * Always carries a 403 status so API routes can use it directly in responses.
 */
export class PermissionError extends Error {
  readonly status = 403;

  constructor(message = "Forbidden") {
    super(message);
    this.name = "PermissionError";
  }
}

export type SessionWithRole = {
  user?: {
    role?: string | null;
  } | null;
} | null;

// Narrow untrusted database/session role strings to the roles this portal supports.
export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return ADMIN_ROLES.includes(role as AdminRole);
}

// Route checks are safe-by-default: unknown roles or unmatched paths are denied.
export function canAccessRoute(role: string | null | undefined, pathname: string) {
  if (!isAdminRole(role)) {
    return false;
  }

  return ROLE_ROUTE_MAP.some((route) => {
    // The dashboard is exact-only so "/" does not accidentally authorize every route.
    const pathMatches = route.exact
      ? pathname === route.prefix
      : pathname === route.prefix || pathname.startsWith(`${route.prefix}/`);

    return pathMatches && route.allowedRoles.includes(role);
  });
}

export function assertRole(
  session: SessionWithRole,
  allowedRoles: readonly AdminRole[],
) {
  const role = session?.user?.role;

  // Server-side guards throw so route handlers/actions cannot silently continue.
  if (!isAdminRole(role) || !allowedRoles.includes(role)) {
    throw new PermissionError();
  }

  return session;
}

// Action checks are separate from routes so mutations can enforce intent directly.
export function assertCan(action: AdminAction, session: SessionWithRole) {
  return assertRole(session, ACTION_ROLE_MAP[action]);
}
