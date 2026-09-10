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

    for (const route of ["/sign-in", "/accept-invite", "/forgot-password", "/reset-password", "/verify", "/verify/sp-public-001", "/verify/checkout/verification-001", "/wallet/topups/return"]) {
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

  it("lets self-authenticating API prefixes reach their own handler instead of redirecting to sign-in", () => {
    getSessionCookieMock.mockReturnValue(null);

    for (const route of [
      // External vendor API-key callers and the vendor portal's own
      // cookie-authenticated routes both need their own auth check to run —
      // neither ever carries this app's session cookie in the API-key case,
      // and the cookie-session routes need to return JSON 401, not a redirect.
      "/api/vendor/v1/verification-sessions",
      "/api/vendor/invoices",
      "/api/vendor/invoices/invoice-1",
      "/api/vendor/invoices/invoice-1/download",
      "/api/vendor/live-verifications",
      "/api/vendor/verifications/req-1",
      "/api/vendor/verifications/req-1/retry",
      "/api/vendor/verifications/export",
      "/api/vendor/integrations/api-keys",
      "/api/vendor/integrations/webhook",
      "/api/wallet/v1/activations/request",
      "/api/wallet/v1/activations/verify",
      "/api/wallet/v1/sessions/refresh",
      "/api/wallet/v1/sessions/revoke",
      "/api/wallet/v1/topups",
      "/api/wallet/v1/topups/topup-1",
      "/api/wallet/v1/topups/topup-1/reconcile",
      // Server-to-server: HMAC-signed webhooks and CRON_SECRET-guarded jobs.
      "/api/webhooks/agent",
      "/api/webhooks/paystack",
      "/api/cron/credential-automation",
      "/api/cron/wallet-topups-reconcile",
    ]) {
      expect(proxy(request(route)).status, route).toBe(200);
    }
  });

  it("still redirects an unauthenticated request to an ordinary admin API-adjacent page route", () => {
    getSessionCookieMock.mockReturnValue(null);

    // The exemption is scoped to /api/vendor, /api/webhooks, and /api/cron —
    // it must not silently become "skip auth for everything under /api" or
    // "skip auth for /vendors" (an admin page, not a vendor-portal route).
    expect(proxy(request("/vendors/invoices")).status).toBe(307);
  });
});
