// @vitest-environment node
import { createHmac, timingSafeEqual } from "node:crypto";
import { describe, expect, it } from "vitest";
import { endpoints, exampleRequest, keyPresets, pendingRefundExample, signatureExample } from "@/lib/vendors/integrationGuide";
import { refundOperationSchema, refundRegistrationSchema } from "@/lib/payments/refundOperationContract";
describe("shared integration examples", () => {
  it("keeps the payment preset free of refunds and verification permissions", () => {
    expect(keyPresets.payments).toEqual(["payments:create", "payments:read", "payments:cancel"]);
    expect(keyPresets.verification).toEqual(["verification:create", "verification:read"]);
  });
  it("uses valid refund instructions and snapshots", () => {
    const registration = endpoints.find(e => e.id === "refund-register")!.body!;
    expect(refundRegistrationSchema.parse({ amountMinor: registration.amountMinor, idempotencyKey: registration.idempotencyKey })).toMatchObject({ amountMinor: 1500 });
    expect(refundOperationSchema.parse(pendingRefundExample).status).toBe("PENDING");
    for (const endpoint of endpoints.filter(e => ["refund-read", "refund-register", "refund-execute", "refund-cancel"].includes(e.id))) expect(() => refundOperationSchema.parse(endpoint.response)).not.toThrow();
  });
  it("generates executable Node requests with correct immutable terms and configured targets", async () => {
    const endpoint = endpoints.find(e => e.id === "payment-create")!;
    let request: { url: string; options: RequestInit } | undefined;
    const script = exampleRequest(endpoint, "https://portal.example/", "branch-123", "node");
    const run = new Function("fetch", "process", `return (async () => { ${script}\n})();`);
    await run(async (url: string, options: RequestInit) => { request = { url, options }; return { ok: true, status: 201, json: async () => ({ status: "PENDING" }) }; }, { env: { UNIFY_VENDOR_API_KEY: "server-secret" } });
    expect(request!.url).toBe("https://portal.example/api/vendor/v1/payment-requests");
    expect(JSON.parse(request!.options.body as string)).toMatchObject({ branchId: "branch-123", amountMinor: 3500, currency: "ZAR", idempotencyKey: "example-sale-key-001" });
    expect(script).not.toContain("server-secret");
    expect(exampleRequest(endpoint, "https://portal.example", "branch-123", "curl")).not.toContain("\n+");
  });
  it("keeps verification and payment signatures distinct and checks raw bytes, age and malformed signatures", () => {
    const raw = Buffer.from('{ "status": "PAID" }'); const timestamp = Math.floor(Date.now() / 1000).toString(); const secret = "example-only-secret";
    for (const kind of ["verification", "payments"] as const) {
      const source = signatureExample(kind).replace('import { createHmac, timingSafeEqual } from "node:crypto";', "");
      const verify = new Function("createHmac", "timingSafeEqual", `${source}\nreturn validSignature;`)(createHmac, timingSafeEqual);
      const signature = `sha256=${createHmac("sha256", secret).update(kind === "payments" ? `${timestamp}.${raw.toString()}` : raw).digest("hex")}`;
      const args = kind === "payments" ? [timestamp, secret] : [secret];
      expect(verify(raw, signature, ...args)).toBe(true);
      expect(verify(Buffer.from('{"status":"PAID"}'), signature, ...args)).toBe(false);
      expect(verify(raw, "sha256=bad", ...args)).toBe(false);
      if (kind === "payments") expect(verify(raw, signature, String(Number(timestamp) - 600), secret)).toBe(false);
    }
  });
});
