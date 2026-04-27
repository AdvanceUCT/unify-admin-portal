import { describe, expect, it } from "vitest";
import { buildWalletActivationLink } from "@/lib/api/activationLinks";

describe("wallet activation link builder", () => {
  it("builds token activation links for the wallet route", () => {
    const activationUrl = buildWalletActivationLink("opaque-token");
    const parsedUrl = new URL(activationUrl);

    expect(parsedUrl.protocol).toBe("unifywallet:");
    expect(parsedUrl.host).toBe("activate");
    expect(parsedUrl.searchParams.get("token")).toBe("opaque-token");
    expect([...parsedUrl.searchParams.keys()]).toEqual(["token"]);
    expect(activationUrl).not.toContain("oob=");
  });

  it("url-encodes token values", () => {
    const activationUrl = buildWalletActivationLink("opaque token+symbols?");

    expect(activationUrl).toBe("unifywallet://activate?token=opaque+token%2Bsymbols%3F");
  });

  it("rejects blank tokens", () => {
    expect(() => buildWalletActivationLink("   ")).toThrow("Activation token is required.");
  });
});
