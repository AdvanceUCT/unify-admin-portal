import { getSessionCookie } from "better-auth/cookies";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { proxy } from "../../proxy";

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: vi.fn(),
}));

const getSessionCookieMock = vi.mocked(getSessionCookie);

function request(pathname: string) {
  return new NextRequest(new URL(pathname, "http://localhost:3000"));
}

describe("proxy", () => {
  beforeEach(() => {
    getSessionCookieMock.mockReset();
  });

  it("redirects unauthenticated admin routes to sign in with callback", () => {
    getSessionCookieMock.mockReturnValue(null);

    const response = proxy(request("/credentials/issuance/batch"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?callbackURL=%2Fcredentials%2Fissuance%2Fbatch",
    );
  });

  it("allows public auth and recovery routes without a session", () => {
    getSessionCookieMock.mockReturnValue(null);

    for (const route of ["/sign-in", "/accept-invite", "/forgot-password", "/reset-password", "/verify", "/verify/sp-public-001"]) {
      expect(proxy(request(route)).status, route).toBe(200);
    }
  });

  it("redirects signed-in users away from sign in", () => {
    getSessionCookieMock.mockReturnValue("session-cookie");

    const response = proxy(request("/sign-in"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("skips Better Auth API routes and static assets", () => {
    getSessionCookieMock.mockReturnValue(null);

    for (const route of ["/api/auth/sign-in/email", "/_next/static/app.js", "/favicon.ico", "/logo.png"]) {
      expect(proxy(request(route)).status, route).toBe(200);
    }
  });
});
