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
    expect(canAccessRoute("ISSUER", "/credentials/batch")).toBe(true);
    expect(canAccessRoute("VIEWER", "/credentials/batch")).toBe(false);
    expect(canAccessRoute("VIEWER", "/anything-else")).toBe(false);
  });

  it("rejects authenticated users without required route roles", () => {
    expect(canAccessRoute("VIEWER", "/vendors")).toBe(false);
    expect(() => assertRole(session("VIEWER"), ["SUPER_ADMIN"])).toThrow(PermissionError);
  });

  it("rejects unknown role strings", () => {
    expect(canAccessRoute("OWNER", "/")).toBe(false);
    expect(() => assertRole(session("OWNER"), ["SUPER_ADMIN"])).toThrow(PermissionError);
  });

  it("enforces action-level permissions", () => {
    expect(assertCan("credential:write", session("ISSUER"))).toEqual(session("ISSUER"));
    expect(() => assertCan("session:revoke", session("ADMIN"))).toThrow(PermissionError);
  });
});
