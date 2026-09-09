/**
 * @fileoverview Handles the `/api/webhooks/paystack` API boundary — no browser session; HMAC signature only.
 * @module app/api/webhooks/paystack/route
 */

import { NextResponse } from "next/server";

import { recordBillingException } from "@/lib/billing/exceptions";
import { recordGatewayEvent, recordGatewayEventFailure, markGatewayEventProcessed } from "@/lib/billing/gatewayEvents";
import { confirmInvoicePayment } from "@/lib/billing/paymentConfirmation";
import { prisma } from "@/lib/db/prisma";
import { resolvePaystackProviderConfig } from "@/lib/paymentProviders/paystack/config";
import { isPaystackWebhookBodyWithinLimit, verifyPaystackWebhookSignature } from "@/lib/paymentProviders/paystack/signature";

const HANDLED_EVENT_TYPE = "charge.success";
const REVIEW_EVENT_KEYWORDS = ["dispute", "refund", "reversal", "chargeback"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Strips sensitive sub-objects (`authorization`, `customer`) before anything is persisted. */
function safePayloadSnapshot(payload: Record<string, unknown>) {
  const data = isRecord(payload.data) ? payload.data : {};
  return {
    event: payload.event,
    data: {
      id: data.id,
      reference: data.reference,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      domain: data.domain,
      paid_at: data.paid_at,
      gateway_response: data.gateway_response,
    },
  };
}

/**
 * Handles POST requests to `/api/webhooks/paystack`. Reads exact raw bytes
 * before touching JSON so the signature is validated against what Paystack
 * actually sent, bounds payload size, deduplicates by
 * (account, mode, event type, reference), and routes every `charge.success`
 * through `confirmInvoicePayment` — the same authoritative boundary the
 * owner-triggered reconcile route uses.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!isPaystackWebhookBodyWithinLimit(rawBody)) {
    return NextResponse.json({ error: { message: "Payload too large." } }, { status: 413 });
  }

  let config;
  try {
    config = resolvePaystackProviderConfig();
  } catch {
    return NextResponse.json({ error: { message: "Paystack is not configured." } }, { status: 500 });
  }

  if (!verifyPaystackWebhookSignature(rawBody, request.headers.get("x-paystack-signature"), config.secretKey)) {
    return NextResponse.json({ error: { message: "Invalid webhook signature." } }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: { message: "Webhook payload must be valid JSON." } }, { status: 400 });
  }

  if (!isRecord(payload) || typeof payload.event !== "string") {
    return NextResponse.json({ received: true, ignored: true }, { status: 202 });
  }

  const eventType = payload.event;
  const reference = isRecord(payload.data) && typeof payload.data.reference === "string" ? payload.data.reference : null;

  // Dispute/refund/reversal events are recorded for admin review — no
  // automatic reversal or financial-projection change happens here, per the
  // handoff. Any other event type outside our handled set is acknowledged
  // and otherwise ignored.
  if (eventType !== HANDLED_EVENT_TYPE) {
    if (REVIEW_EVENT_KEYWORDS.some((keyword) => eventType.toLowerCase().includes(keyword))) {
      await recordBillingException(prisma, {
        type: "PAYMENT_REVIEW_EVENT",
        dedupeKey: `payment-review-event:${eventType}:${reference ?? "unknown"}`,
        details: { event: eventType, reference },
      });
    }
    return NextResponse.json({ received: true, ignored: true }, { status: 202 });
  }

  if (!reference) {
    return NextResponse.json({ received: true, ignored: true }, { status: 202 });
  }

  const dedupe = await recordGatewayEvent(prisma, {
    provider: "paystack",
    providerAccountRef: config.accountRef,
    providerMode: config.mode,
    eventType,
    resourceKey: reference,
    rawBody,
    payloadSnapshot: safePayloadSnapshot(payload),
  });

  if (dedupe.duplicate) {
    return NextResponse.json({ received: true, duplicate: true }, { status: 202 });
  }

  try {
    const result = await confirmInvoicePayment(prisma, { reference, config });
    await markGatewayEventProcessed(prisma, dedupe.id);
    return NextResponse.json({ received: true, outcome: result.outcome }, { status: 202 });
  } catch (error) {
    await recordGatewayEventFailure(prisma, dedupe.id, error, 60);
    return NextResponse.json({ error: { message: "Failed to process webhook event." } }, { status: 500 });
  }
}
