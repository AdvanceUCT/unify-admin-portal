import { describe, expect, it } from "vitest";

import { sanitizeCallbackUrl } from "@/lib/auth/redirects";

describe("sanitizeCallbackUrl", () => {
  it("allows relative callback paths", () => {
    expect(sanitizeCallbackUrl("/credentials?status=active#list")).toBe(
      "/credentials?status=active#list",
    );
  });

  it("falls back to dashboard for external URLs", () => {
    expect(sanitizeCallbackUrl("https://evil.example/phish")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("//evil.example/phish")).toBe("/dashboard");
  });

  it("falls back to dashboard for empty or malformed values", () => {
    expect(sanitizeCallbackUrl(undefined)).toBe("/dashboard");
    expect(sanitizeCallbackUrl("http://[::1")).toBe("/dashboard");
  });
});
