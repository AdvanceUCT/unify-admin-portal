import { describe, expect, it } from "vitest";

import {
  ADMIN_ROLES,
  PermissionError,
  assertCan,
  assertRole,
  canAccessRoute,
  type AdminRole,
  type SessionWithRole,
} from "@/lib/auth/permissions";

function session(role: string): SessionWithRole {
  return {
    user: {
      role,
    },
  };
}

describe("permissions", () => {
  const routeMatrix: Record<AdminRole, Record<string, boolean>> = {
    SUPER_ADMIN: {
      "/": true,
      "/credentials": true,
      "/students": true,
      "/vendors": true,
      "/rules": true,
      "/audit": true,
      "/users": true,
    },
    ADMIN: {
      "/": true,
      "/credentials": true,
      "/students": true,
      "/vendors": true,
      "/rules": true,
      "/audit": true,
      "/users": false,
    },
    ISSUER: {
      "/": true,
      "/credentials": true,
      "/students": true,
      "/vendors": false,
      "/rules": false,
      "/audit": false,
      "/users": false,
    },
    VIEWER: {
      "/": true,
      "/credentials": false,
      "/students": false,
      "/vendors": false,
      "/rules": false,
      "/audit": true,
      "/users": false,
    },
  };

  it("allows every role to access the dashboard route", () => {
    for (const role of ADMIN_ROLES) {
      expect(canAccessRoute(role, "/")).toBe(true);
    }
  });

  it.each([
    ["SUPER_ADMIN", ["/credentials", "/students", "/vendors", "/rules", "/audit", "/users"]],
    ["ADMIN", ["/credentials", "/students", "/vendors", "/rules", "/audit"]],
    ["ISSUER", ["/credentials", "/students"]],
    ["VIEWER", ["/audit"]],
  ] satisfies Array<[AdminRole, string[]]>)(
    "allows %s to access assigned route prefixes",
    (role, allowedRoutes) => {
      for (const route of allowedRoutes) {
        expect(canAccessRoute(role, route)).toBe(true);
      }
    },
  );

  it("uses prefix matching for nested routes without making dashboard a wildcard", () => {
    expect(canAccessRoute("ISSUER", "/credentials/issuance/batch")).toBe(true);
    expect(canAccessRoute("VIEWER", "/credentials/issuance/batch")).toBe(false);
    expect(canAccessRoute("VIEWER", "/anything-else")).toBe(false);
  });

  it("rejects authenticated users without required route roles", () => {
    expect(canAccessRoute("VIEWER", "/vendors")).toBe(false);
    expect(() => assertRole(session("VIEWER"), ["SUPER_ADMIN"])).toThrow(PermissionError);
  });

  it("rejects unknown role strings", () => {
    expect(canAccessRoute("OWNER", "/")).toBe(false);
    expect(canAccessRoute(null, "/")).toBe(false);
    expect(canAccessRoute(undefined, "/")).toBe(false);
    expect(() => assertRole(session("OWNER"), ["SUPER_ADMIN"])).toThrow(PermissionError);
  });

  it("enforces the full route matrix", () => {
    for (const role of ADMIN_ROLES) {
      for (const [route, expected] of Object.entries(routeMatrix[role])) {
        expect(canAccessRoute(role, route), `${role} ${route}`).toBe(expected);
      }
    }
  });

  it("enforces action-level permissions", () => {
    expect(assertCan("credential:write", session("ISSUER"))).toEqual(session("ISSUER"));
    expect(assertCan("credential:schema:manage", session("ADMIN"))).toEqual(session("ADMIN"));
    expect(() => assertCan("credential:schema:manage", session("ISSUER"))).toThrow(PermissionError);
    expect(() => assertCan("session:revoke", session("ADMIN"))).toThrow(PermissionError);
  });
});
