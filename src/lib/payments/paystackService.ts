/**
 * @fileoverview Thin client for the Paystack transaction API used to collect vendor payments.
 * @module lib/payments/paystackService
 */

import "server-only";

import { env } from "@/lib/config/env";

const PAYSTACK_BASE_URL = "https://api.paystack.co";

export type InitializeTransactionParams = {
  /** Amount in the smallest currency unit (cents). */
  amountCents: number;
  email: string;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
};

export type InitializeTransactionResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

export type VerifyTransactionResult = {
  status: string;
  reference: string;
  amountCents: number;
  metadata: Record<string, unknown> | null;
};

function paystackSecretKey() {
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured.");
  }
  return env.PAYSTACK_SECRET_KEY;
}

function paystackHeaders() {
  return {
    Authorization: `Bearer ${paystackSecretKey()}`,
    "Content-Type": "application/json",
  };
}

/** Starts a Paystack checkout and returns the URL to redirect the payer's browser to. */
export async function initializeTransaction(
  params: InitializeTransactionParams,
): Promise<InitializeTransactionResult> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: paystackHeaders(),
    body: JSON.stringify({
      email: params.email,
      amount: params.amountCents,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.status) {
    throw new Error(body?.message ?? "Unable to initialize Paystack transaction.");
  }

  return {
    authorizationUrl: body.data.authorization_url,
    accessCode: body.data.access_code,
    reference: body.data.reference,
  };
}

/** Confirms a transaction's outcome directly with Paystack — the source of truth, never trust client-reported status. */
export async function verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
  const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: paystackHeaders(),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.status) {
    throw new Error(body?.message ?? "Unable to verify Paystack transaction.");
  }

  return {
    status: body.data.status,
    reference: body.data.reference,
    amountCents: body.data.amount,
    metadata: body.data.metadata ?? null,
  };
}
