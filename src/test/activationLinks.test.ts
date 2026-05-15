import { describe, expect, it } from "vitest";
import { buildWalletActivationLink, buildWalletDeepLink, toPublicWalletActivationLink } from "@/lib/api/activationLinks";

describe("wallet activation link builder", () => {
  it("builds token activation links for the public activation route", () => {
    const activationUrl = buildWalletActivationLink("opaque-token", "https://admin.example.test");
    const parsedUrl = new URL(activationUrl);

    expect(parsedUrl.protocol).toBe("https:");
    expect(parsedUrl.host).toBe("admin.example.test");
    expect(parsedUrl.pathname).toBe("/activate");
    expect(parsedUrl.searchParams.get("token")).toBe("opaque-token");
    expect([...parsedUrl.searchParams.keys()]).toEqual(["token"]);
    expect(activationUrl).not.toContain("oob=");
  });

  it("keeps custom wallet deep links available for the fallback open action", () => {
    expect(buildWalletDeepLink("opaque-token")).toBe("unifywallet://activate?token=opaque-token");
  });

  it("url-encodes token values", () => {
    const activationUrl = buildWalletActivationLink("opaque token+symbols?", "https://admin.example.test");

    expect(activationUrl).toBe("https://admin.example.test/activate?token=opaque+token%2Bsymbols%3F");
  });

  it("rejects blank tokens", () => {
    expect(() => buildWalletActivationLink("   ")).toThrow("Activation token is required.");
  });

  it("converts agent deep links into public activation links", () => {
    expect(toPublicWalletActivationLink("unifywallet://activate?token=agent-token", "https://admin.example.test")).toBe(
      "https://admin.example.test/activate?token=agent-token",
    );
  });
});
