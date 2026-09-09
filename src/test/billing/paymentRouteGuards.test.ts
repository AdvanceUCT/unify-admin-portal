import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/env", () => ({ env: { APP_URL: "http://localhost:3000" } }));

import { isRateLimited, isSameOriginRequest } from "@/lib/billing/paymentRouteGuards";

function requestWithHeaders(headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/vendor/invoices/x/payment-attempts", { method: "POST", headers });
}

describe("isSameOriginRequest", () => {
  it("accepts a matching Origin header", () => {
    expect(isSameOriginRequest(requestWithHeaders({ origin: "http://localhost:3000" }))).toBe(true);
  });

  it("rejects a foreign Origin header", () => {
    expect(isSameOriginRequest(requestWithHeaders({ origin: "https://evil.example" }))).toBe(false);
  });

  it("falls back to a matching Referer when Origin is absent", () => {
    expect(isSameOriginRequest(requestWithHeaders({ referer: "http://localhost:3000/vendor/invoices/x" }))).toBe(true);
  });

  it("rejects a foreign Referer when Origin is absent", () => {
    expect(isSameOriginRequest(requestWithHeaders({ referer: "https://evil.example/steal" }))).toBe(false);
  });

  it("rejects a request with neither header", () => {
    expect(isSameOriginRequest(requestWithHeaders({}))).toBe(false);
  });

  it("rejects a malformed Referer instead of throwing", () => {
    expect(isSameOriginRequest(requestWithHeaders({ referer: "not a url" }))).toBe(false);
  });
});

describe("isRateLimited", () => {
  it("allows requests under the limit and blocks once the limit is exceeded within the window", () => {
    const key = `test-key-${Math.random()}`;
    const now = Date.now();

    for (let i = 0; i < 5; i += 1) {
      expect(isRateLimited(key, now)).toBe(false);
    }
    expect(isRateLimited(key, now)).toBe(true);
  });

  it("allows a request again once the window has passed", () => {
    const key = `test-key-${Math.random()}`;
    const start = Date.now();

    for (let i = 0; i < 5; i += 1) expect(isRateLimited(key, start)).toBe(false);
    expect(isRateLimited(key, start)).toBe(true);
    expect(isRateLimited(key, start + 31_000)).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const keyA = `test-key-a-${Math.random()}`;
    const keyB = `test-key-b-${Math.random()}`;
    const now = Date.now();

    for (let i = 0; i < 5; i += 1) isRateLimited(keyA, now);
    expect(isRateLimited(keyA, now)).toBe(true);
    expect(isRateLimited(keyB, now)).toBe(false);
  });
});
