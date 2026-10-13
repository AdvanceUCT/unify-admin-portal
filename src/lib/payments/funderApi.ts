/**
 * @fileoverview Shared handling for the public, capability-bound funder top-up routes.
 * @module lib/payments/funderApi
 */

import "server-only";

import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { isRateLimited, isSameOriginRequest } from "@/lib/billing/paymentRouteGuards";
import { WalletDomainError } from "@/lib/payments/errors";
import type { FunderTopupResult } from "@/lib/payments/topups";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

const funderTopupRequestSchema = z.object({
  topUpId: z.string().trim().min(1).max(64),
  reference: z.string().trim().min(1).max(64),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}

/**
 * Fixed messages only: unlike `walletErrorResponse`, a domain error's own
 * message is never passed through, since it could describe the student.
 */
function funderErrorResponse(error: unknown) {
  if (error instanceof ZodError) return errorResponse(400, "INVALID_REQUEST", "The request is invalid.");
  if (error instanceof WalletDomainError && error.code === "TOPUP_NOT_FOUND") {
    return errorResponse(404, "TOPUP_NOT_FOUND", "Payment not found.");
  }
  return errorResponse(503, "UNAVAILABLE", "We couldn't check this payment right now. Please try again.");
}

/**
 * Runs a funder status/reconcile operation behind the same-origin check, body
 * validation and a per-route, per-top-up in-memory rate limit.
 */
export async function handleFunderTopupRequest(
  request: Request,
  rateLimitPrefix: string,
  operation: (input: z.infer<typeof funderTopupRequestSchema>) => Promise<FunderTopupResult>,
) {
  if (!isSameOriginRequest(request)) {
    return errorResponse(403, "FORBIDDEN", "Cross-origin requests are not allowed.");
  }

  try {
    const input = funderTopupRequestSchema.parse(await request.json().catch(() => null));
    if (isRateLimited(`${rateLimitPrefix}:${input.topUpId}`)) {
      return errorResponse(429, "RATE_LIMITED", "Too many requests. Please wait a moment and try again.");
    }
    return NextResponse.json(await operation(input), { headers: NO_STORE });
  } catch (error) {
    return funderErrorResponse(error);
  }
}
