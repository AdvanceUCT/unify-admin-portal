/**
 * @fileoverview Thin, typed fetch wrapper over the Paystack Transactions and
 * Subaccounts APIs. This module makes real network calls — nothing else in
 * `src/lib/billing` talks to `fetch` directly, so every request/response
 * boundary with the provider is auditable in one place.
 *
 * Deliberately not "server-only": `scripts/paystack-check.ts` calls this
 * outside the Next.js server bundle, matching
 * `src/lib/payments/foundation.ts`'s precedent.
 * @module lib/paymentProviders/paystack/client
 */

import { PaystackProviderError } from "@/lib/paymentProviders/paystack/errors";

const DEFAULT_TIMEOUT_MS = 15_000;

export type PaystackInitializeTransactionInput = {
  email: string;
  amountMinor: bigint;
  currency: string;
  reference: string;
  subaccountCode: string;
  transactionChargeMinor: bigint;
  callbackUrl: string;
  metadata: Record<string, unknown>;
};

export type PaystackInitializeTransactionResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

export type PaystackInitializeTopupTransactionInput = {
  email: string;
  amountMinor: bigint;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
};

export type PaystackVerifyTransactionResult = {
  providerTransactionId: string;
  reference: string;
  status: "success" | "failed" | "abandoned" | string;
  amountMinor: bigint;
  currency: string;
  domain: string;
  paidAtIso: string | null;
  gatewayResponse: string | null;
  subaccountCode: string | null;
  feesMinor: bigint | null;
  /** Raw, non-sensitive split subset only — never the customer/authorization objects. */
  splitEvidence: unknown;
};

export type PaystackSubaccountResult = {
  subaccountCode: string;
  active: boolean;
  currency: string;
  domain: string;
  integrationId: string;
};

function toSafeAmountNumber(amountMinor: bigint, fieldName: string): number {
  if (amountMinor < BigInt(0)) {
    throw new PaystackProviderError("AMOUNT_UNSAFE", `${fieldName} must be nonnegative.`);
  }
  if (amountMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PaystackProviderError("AMOUNT_UNSAFE", `${fieldName} exceeds the safe integer range for the provider API.`);
  }
  return Number(amountMinor);
}

async function paystackFetch(
  secretKey: string,
  baseUrl: string,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ status: number; json: unknown }> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // A network error or abort before we know whether Paystack accepted the
    // request is genuinely ambiguous, not a failure — the caller (attempt
    // preparation) is responsible for marking this UNKNOWN rather than FAILED.
    const errorName = (error as { name?: unknown } | null)?.name;
    const isTimeout = errorName === "TimeoutError" || errorName === "AbortError";
    throw new PaystackProviderError(
      isTimeout ? "TIMEOUT" : "UNKNOWN_OUTCOME",
      isTimeout
        ? `Paystack request to ${path} timed out after ${timeoutMs}ms before a response was received.`
        : `Paystack request to ${path} failed before a response was received.`,
      error,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    throw new PaystackProviderError("MALFORMED_RESPONSE", `Paystack response for ${path} was not valid JSON.`, error);
  }

  return { status: response.status, json };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractMessage(json: unknown): string {
  return isRecord(json) && typeof json.message === "string" ? json.message : "Paystack returned an error.";
}

function assertSuccessEnvelope(status: number, json: unknown, path: string): Record<string, unknown> {
  if (status >= 500) {
    throw new PaystackProviderError("HTTP_ERROR", `Paystack ${path} returned server error ${status}: ${extractMessage(json)}`);
  }

  if (status >= 400) {
    const message = extractMessage(json);
    // Paystack's own minimum-amount rejection is a 4xx with a message we can
    // recognize, per the handoff's "insufficient university share/minimum
    // amounts" case — everything else 4xx is a generic configuration/HTTP error.
    if (/minimum|too small|amount must be at least/i.test(message)) {
      throw new PaystackProviderError("AMOUNT_TOO_SMALL", `Paystack ${path} rejected the amount: ${message}`);
    }
    throw new PaystackProviderError("HTTP_ERROR", `Paystack ${path} returned ${status}: ${message}`);
  }

  if (!isRecord(json) || json.status !== true || !isRecord(json.data)) {
    // Top-level `status: true` only says the API call succeeded, per the
    // handoff — but a malformed/missing `data` envelope is still not usable.
    throw new PaystackProviderError("MALFORMED_RESPONSE", `Paystack ${path} response did not contain a usable data envelope.`);
  }

  return json.data;
}

/**
 * Initializes a server-side Paystack transaction for the exact snapshot
 * amount/split an already-prepared payment attempt recorded. Never receives
 * or returns card/authorization details — this is the access-code/
 * authorization-URL boundary only.
 */
export async function initializeTransaction(
  secretKey: string,
  baseUrl: string,
  input: PaystackInitializeTransactionInput,
): Promise<PaystackInitializeTransactionResult> {
  const amount = toSafeAmountNumber(input.amountMinor, "amountMinor");
  const transactionCharge = toSafeAmountNumber(input.transactionChargeMinor, "transactionChargeMinor");

  const { status, json } = await paystackFetch(secretKey, baseUrl, "/transaction/initialize", {
    method: "POST",
    body: {
      email: input.email,
      amount: String(amount),
      currency: input.currency,
      reference: input.reference,
      subaccount: input.subaccountCode,
      transaction_charge: transactionCharge,
      bearer: "account",
      channels: ["card"],
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    },
  });

  const data = assertSuccessEnvelope(status, json, "/transaction/initialize");
  if (
    typeof data.authorization_url !== "string" ||
    typeof data.access_code !== "string" ||
    typeof data.reference !== "string"
  ) {
    throw new PaystackProviderError("MALFORMED_RESPONSE", "Paystack initialize response was missing required fields.");
  }

  return {
    authorizationUrl: data.authorization_url,
    accessCode: data.access_code,
    reference: data.reference,
  };
}

/**
 * Initializes a student wallet top-up into the university's main Paystack
 * account. This intentionally omits subaccount, transaction_charge, and
 * bearer fields: student top-ups are not vendor invoice split payments.
 */
export async function initializeTopupTransaction(
  secretKey: string,
  baseUrl: string,
  input: PaystackInitializeTopupTransactionInput,
): Promise<PaystackInitializeTransactionResult> {
  const amount = toSafeAmountNumber(input.amountMinor, "amountMinor");

  const { status, json } = await paystackFetch(secretKey, baseUrl, "/transaction/initialize", {
    method: "POST",
    body: {
      email: input.email,
      amount: String(amount),
      currency: input.currency,
      reference: input.reference,
      channels: ["card"],
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    },
  });

  const data = assertSuccessEnvelope(status, json, "/transaction/initialize");
  if (
    typeof data.authorization_url !== "string" ||
    typeof data.access_code !== "string" ||
    typeof data.reference !== "string"
  ) {
    throw new PaystackProviderError("MALFORMED_RESPONSE", "Paystack initialize response was missing required fields.");
  }

  return {
    authorizationUrl: data.authorization_url,
    accessCode: data.access_code,
    reference: data.reference,
  };
}

/**
 * Authoritative server-side verification of a transaction reference — the
 * only place a `success` status is ever accepted from. Extracts only the
 * fields `confirmInvoicePayment` needs to check; never surfaces the
 * `authorization`/`customer` sub-objects.
 */
export async function verifyTransaction(
  secretKey: string,
  baseUrl: string,
  reference: string,
): Promise<PaystackVerifyTransactionResult> {
  const { status, json } = await paystackFetch(secretKey, baseUrl, `/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
  });

  const data = assertSuccessEnvelope(status, json, "/transaction/verify");
  if (
    (typeof data.id !== "number" && typeof data.id !== "string") ||
    typeof data.reference !== "string" ||
    typeof data.status !== "string" ||
    typeof data.amount !== "number" ||
    typeof data.currency !== "string" ||
    typeof data.domain !== "string"
  ) {
    throw new PaystackProviderError("MALFORMED_RESPONSE", "Paystack verify response was missing required fields.");
  }

  const subaccount = isRecord(data.subaccount) && typeof data.subaccount.subaccount_code === "string" ? data.subaccount.subaccount_code : null;

  return {
    providerTransactionId: String(data.id),
    reference: data.reference,
    status: data.status,
    amountMinor: BigInt(Math.trunc(data.amount)),
    currency: data.currency,
    domain: data.domain,
    paidAtIso: typeof data.paid_at === "string" ? data.paid_at : null,
    gatewayResponse: typeof data.gateway_response === "string" ? data.gateway_response : null,
    subaccountCode: subaccount,
    feesMinor: typeof data.fees === "number" ? BigInt(Math.trunc(data.fees)) : null,
    splitEvidence: isRecord(data.split) ? data.split : null,
  };
}

/**
 * Reads a subaccount's safe, non-financial-detail fields (never bank account
 * numbers) to power `billing:paystack-check`'s configuration health report.
 */
export async function fetchSubaccount(secretKey: string, baseUrl: string, subaccountCode: string): Promise<PaystackSubaccountResult> {
  const { status, json } = await paystackFetch(secretKey, baseUrl, `/subaccount/${encodeURIComponent(subaccountCode)}`, {
    method: "GET",
  });

  const data = assertSuccessEnvelope(status, json, "/subaccount");
  if (typeof data.subaccount_code !== "string" || typeof data.active !== "boolean" || typeof data.currency !== "string" || typeof data.domain !== "string") {
    throw new PaystackProviderError("MALFORMED_RESPONSE", "Paystack subaccount response was missing required fields.");
  }

  const integrationId = isRecord(data.integration)
    ? String((data.integration as Record<string, unknown>).id ?? "")
    : String(data.integration ?? "");

  return {
    subaccountCode: data.subaccount_code,
    active: data.active,
    currency: data.currency,
    domain: data.domain,
    integrationId,
  };
}
