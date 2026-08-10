/**
 * @fileoverview Handles the `/api/webhooks/agent` API boundary, including its authorization and request validation.
 * @module app/api/webhooks/agent/route
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "@/lib/config/env";
import { requestIdFrom } from "@/lib/requestId";
import { recordCredentialStateChangedEvent } from "@/lib/credentials/status";
import { recordCredentialLifecycleChangedEvent } from "@/lib/credentials/lifecycleActions";
import type {
  CredentialLifecycleChangedWebhookPayload,
  CredentialStateChangedWebhookPayload,
} from "@/lib/credentials/statusMapping";
import {
  recordVerificationCompletedEvent,
  type VerificationCompletedEvent,
} from "@/lib/vendors/verifications";

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

function isCredentialLifecycleChangedPayload(value: unknown): value is CredentialLifecycleChangedWebhookPayload {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === "credential.lifecycleChanged" &&
    typeof record.credentialExchangeId === "string" &&
    typeof record.credentialRevocationId === "string" &&
    typeof record.revocationRegistryDefinitionId === "string" &&
    typeof record.eventId === "string" &&
    (record.previousStatus === "ACTIVE" || record.previousStatus === "SUSPENDED" || record.previousStatus === "REVOKED") &&
    (record.status === "ACTIVE" || record.status === "SUSPENDED" || record.status === "REVOKED") &&
    typeof record.timestamp === "string"
  );
}

function correlatedJson(requestId: string, body: unknown, init: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("X-Request-ID", requestId);
  return response;
}

function isVerificationCompletedPayload(value: unknown): value is VerificationCompletedEvent {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const hasValidDates = [record.expiresAt, record.completedAt, record.timestamp].every(
    (date) => typeof date === "string" && Number.isFinite(Date.parse(date)),
  );
  return (
    record.type === "verification.completed" &&
    typeof record.eventId === "string" &&
    typeof record.verificationRequestId === "string" &&
    typeof record.vendorId === "string" &&
    typeof record.servicePointId === "string" &&
    ["Approved", "Declined", "Expired", "Failed"].includes(String(record.decision)) &&
    (record.checkoutId === undefined || typeof record.checkoutId === "string") &&
    (record.isVerified === undefined || typeof record.isVerified === "boolean") &&
    (record.attributes === undefined || (record.attributes !== null && typeof record.attributes === "object" && !Array.isArray(record.attributes))) &&
    hasValidDates
  );
}

/**
 * Receives incoming webhook events from the Identity Agent Service.
 * Validates the HMAC signature before processing, then records the event
 * if it's a credential state change. Unknown event types are acknowledged
 * but ignored. Always returns 202 so the agent doesn't retry on our end.
 */
export async function POST(request: Request) {
  const requestId = requestIdFrom(request.headers.get("x-request-id"));
  const body = await request.text();

  if (!env.WEBHOOK_SIGNING_SECRET) {
    return correlatedJson(
      requestId,
      { error: { message: "WEBHOOK_SIGNING_SECRET is not configured." } },
      { status: 500 },
    );
  }

  if (!signaturesMatch(request.headers.get("x-unify-signature"), signatureFor(body, env.WEBHOOK_SIGNING_SECRET))) {
    return correlatedJson(requestId, { error: { message: "Invalid webhook signature." } }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return correlatedJson(requestId, { error: { message: "Webhook payload must be valid JSON." } }, { status: 400 });
  }

  if (isCredentialStateChangedPayload(payload)) {
    const result = await recordCredentialStateChangedEvent(payload);
    return correlatedJson(
      requestId,
      { duplicate: result.duplicate, ignored: result.ignored ?? false, received: true },
      { status: 202 },
    );
  }

  if (isCredentialLifecycleChangedPayload(payload)) {
    await recordCredentialLifecycleChangedEvent(payload);
    return correlatedJson(requestId, { received: true }, { status: 202 });
  }

  const eventType = payload && typeof payload === "object" && "type" in payload ? String(payload.type) : "unknown";
  console.info(`[webhooks] [${requestId}] received ${eventType}`);

  if (isVerificationCompletedPayload(payload)) {
    const result = await recordVerificationCompletedEvent(payload, requestId);
    return correlatedJson(requestId, { duplicate: result.duplicate, received: true }, { status: 202 });
  }

  return correlatedJson(requestId, { ignored: true, received: true }, { status: 202 });
}
