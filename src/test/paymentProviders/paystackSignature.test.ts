import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  MAX_PAYSTACK_WEBHOOK_BODY_BYTES,
  isPaystackWebhookBodyWithinLimit,
  verifyPaystackWebhookSignature,
} from "@/lib/paymentProviders/paystack/signature";

const SECRET = "whsec_fixture";

function signOf(body: string, secret = SECRET) {
  return createHmac("sha512", secret).update(body).digest("hex");
}

describe("verifyPaystackWebhookSignature", () => {
  it("accepts a body whose signature matches the account secret", () => {
    const body = JSON.stringify({ event: "charge.success" });
    expect(verifyPaystackWebhookSignature(body, signOf(body), SECRET)).toBe(true);
  });

  it("rejects a body that was altered after signing", () => {
    const original = JSON.stringify({ event: "charge.success", amount: 100 });
    const signature = signOf(original);
    const tampered = JSON.stringify({ event: "charge.success", amount: 100_000_00 });

    expect(verifyPaystackWebhookSignature(tampered, signature, SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const body = JSON.stringify({ event: "charge.success" });
    expect(verifyPaystackWebhookSignature(body, null, SECRET)).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const body = JSON.stringify({ event: "charge.success" });
    expect(verifyPaystackWebhookSignature(body, signOf(body, "whsec_other"), SECRET)).toBe(false);
  });

  it("rejects an invalid/malformed signature string without throwing", () => {
    const body = JSON.stringify({ event: "charge.success" });
    expect(verifyPaystackWebhookSignature(body, "not-a-hex-signature", SECRET)).toBe(false);
  });

  it("rejects an oversized body before computing HMAC", () => {
    const oversized = "a".repeat(MAX_PAYSTACK_WEBHOOK_BODY_BYTES + 1);
    expect(isPaystackWebhookBodyWithinLimit(oversized)).toBe(false);
    expect(verifyPaystackWebhookSignature(oversized, signOf(oversized), SECRET)).toBe(false);
  });

  it("accepts a body exactly at the size limit", () => {
    const atLimit = "a".repeat(MAX_PAYSTACK_WEBHOOK_BODY_BYTES);
    expect(isPaystackWebhookBodyWithinLimit(atLimit)).toBe(true);
    expect(verifyPaystackWebhookSignature(atLimit, signOf(atLimit), SECRET)).toBe(true);
  });
});
