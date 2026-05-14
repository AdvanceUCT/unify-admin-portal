import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/.well-known/assetlinks.json/route";

describe("Android asset links route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("publishes the student wallet Android package association", async () => {
    vi.stubEnv("ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS", "AA:BB,CC:DD");

    const response = GET();
    const body = await response.json();

    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(body).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.advanceuct.unifystudentwallet",
          sha256_cert_fingerprints: ["AA:BB", "CC:DD"],
        },
      },
    ]);
  });
});
