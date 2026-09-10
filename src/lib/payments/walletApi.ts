/**
 * @fileoverview Shared JSON responses for wallet API routes.
 * @module lib/payments/walletApi
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { WalletDomainError } from "@/lib/payments/errors";
import { PaystackProviderError } from "@/lib/paymentProviders/paystack/errors";

export function walletJson(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function walletErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Wallet API request is invalid." } },
      { status: 400 },
    );
  }

  if (error instanceof WalletDomainError) {
    const status =
      error.code === "INVALID_WALLET_SESSION" ? 401 :
      error.code === "PAYMENT_WALLET_NOT_ELIGIBLE" ? 403 :
      error.code === "RATE_LIMITED" ? 429 :
      error.code === "IDEMPOTENCY_CONFLICT" ? 409 :
      error.code === "TOPUP_NOT_FOUND" || error.code === "ACCOUNT_NOT_FOUND" ? 404 :
      error.code === "PAYMENT_WALLET_DISABLED" || error.code === "TOPUP_PROVIDER_MISMATCH" ? 503 :
      400;

    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status });
  }

  if (error instanceof PaystackProviderError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.code === "NOT_CONFIGURED" ? 503 : 502 },
    );
  }

  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Unexpected wallet API error." } },
    { status: 500 },
  );
}
