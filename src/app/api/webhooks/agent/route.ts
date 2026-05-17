import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "@/lib/config/env";
import { recordCredentialStateChangedEvent } from "@/lib/credentials/status";
import type { CredentialStateChangedWebhookPayload } from "@/lib/credentials/statusMapping";

/**
 * Computes the expected HMAC-SHA256 signature for a webhook body.
 * Format matches the `x-unify-signature` header sent by the agent.
 */
function signatureFor(body: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/**
 * Compares two signature strings in constant time to prevent timing attacks.
 * A regular string comparison would leak how many characters match.
 */
function signaturesMatch(actual: string | null, expected: string) {
  if (!actual) return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Type guard that checks if a parsed payload is a credential state change event.
 * We check the minimum required fields rather than the full shape to stay
 * tolerant of extra fields the agent might add in future versions.
 */
function isCredentialStateChangedPayload(value: unknown): value is CredentialStateChangedWebhookPayload {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  return (
    record.type === "credential.stateChanged" &&
    typeof record.credentialExchangeId === "string" &&
    typeof record.state === "string" &&
    typeof record.timestamp === "string"
  );
}

/**
 * Receives incoming webhook events from the Identity Agent Service.
 * Validates the HMAC signature before processing, then records the event
 * if it's a credential state change. Unknown event types are acknowledged
 * but ignored. Always returns 202 so the agent doesn't retry on our end.
 */
export async function POST(request: Request) {
  const body = await request.text();

  if (!env.WEBHOOK_SIGNING_SECRET) {
    return NextResponse.json(
      { error: { message: "WEBHOOK_SIGNING_SECRET is not configured." } },
      { status: 500 },
    );
  }

  if (!signaturesMatch(request.headers.get("x-unify-signature"), signatureFor(body, env.WEBHOOK_SIGNING_SECRET))) {
    return NextResponse.json({ error: { message: "Invalid webhook signature." } }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: { message: "Webhook payload must be valid JSON." } }, { status: 400 });
  }

  if (isCredentialStateChangedPayload(payload)) {
    const result = await recordCredentialStateChangedEvent(payload);
    return NextResponse.json(
      { duplicate: result.duplicate, ignored: result.ignored ?? false, received: true },
      { status: 202 },
    );
  }

  return NextResponse.json({ ignored: true, received: true }, { status: 202 });
}
