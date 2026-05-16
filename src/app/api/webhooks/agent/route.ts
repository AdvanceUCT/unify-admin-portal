import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "@/lib/config/env";
import { recordCredentialStateChangedEvent } from "@/lib/credentials/status";
import type { CredentialStateChangedWebhookPayload } from "@/lib/credentials/statusMapping";

function signatureFor(body: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function signaturesMatch(actual: string | null, expected: string) {
  if (!actual) return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

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

  if (!isCredentialStateChangedPayload(payload)) {
    return NextResponse.json({ ignored: true, received: true }, { status: 202 });
  }

  const result = await recordCredentialStateChangedEvent(payload);
  return NextResponse.json({ duplicate: result.duplicate, received: true }, { status: 202 });
}
