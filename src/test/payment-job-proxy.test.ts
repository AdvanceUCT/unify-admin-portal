import { createHash, createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { proxy } from "../../proxy";
import { POST } from "@/app/api/jobs/payment-webhooks/route";

const mocks = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("better-auth/cookies", () => ({ getSessionCookie: () => null }));
vi.mock("@/lib/vendors/paymentWebhooks", () => ({ dispatchPaymentWebhooks: mocks.dispatch }));
const url = "https://portal.example/api/jobs/payment-webhooks";
const key = "ci-only-signing-key";
function sign(body: string, subject = url) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iss: "Upstash", sub: subject, iat: now, nbf: now - 1, exp: now + 60, body: createHash("sha256").update(body).digest("base64url") })}`;
  return `${input}.${createHmac("sha256", key).update(input).digest("base64url")}`;
}
async function throughProxy(body = "{}", signature?: string) {
  const request = new NextRequest(url, { method: "POST", body, headers: signature ? { "upstash-signature": signature } : {} });
  const routed = proxy(request);
  return routed.headers.get("x-middleware-next") ? POST(request) : routed;
}
beforeEach(() => {
  vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", key);
  vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "ci-next-key");
  vi.stubEnv("PAYMENT_WEBHOOK_DISPATCH_URL", url);
  mocks.dispatch.mockReset().mockResolvedValue({ delivered: 1 });
});
afterEach(() => vi.unstubAllEnvs());
it("reaches machine authentication without a browser cookie", async () => {
  expect((await throughProxy()).status).toBe(401);
  expect((await throughProxy("{}", "forged")).status).toBe(401);
  expect(mocks.dispatch).not.toHaveBeenCalled();
});
it("dispatches an actually signed scheduler instruction", async () => {
  expect((await throughProxy("{}", sign("{}"))).status).toBe(200);
  expect(mocks.dispatch).toHaveBeenCalledOnce();
});
it("rejects wrong URL, instruction and oversized body", async () => {
  expect((await throughProxy("{}", sign("{}", "https://wrong.example"))).status).toBe(401);
  for (const body of ['{"payment":1}', " ".repeat(1025)]) {
    expect((await throughProxy(body, sign(body))).status).toBe(400);
  }
  expect(mocks.dispatch).not.toHaveBeenCalled();
});
it("fails closed when configuration is missing", async () => {
  vi.stubEnv("PAYMENT_WEBHOOK_DISPATCH_URL", "");
  expect((await throughProxy()).status).toBe(503);
});
it("keeps neighbouring jobs and admin routes protected", () => {
  for (const path of ["/api/jobs/other", "/api/jobs/payment-webhooks/child", "/credentials"]) {
    expect(proxy(new NextRequest(new URL(path, url))).status).toBe(307);
  }
});
