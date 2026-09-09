/**
 * @fileoverview Shared request guards for the browser-facing payment routes.
 * @module lib/billing/paymentRouteGuards
 */

import { env } from "@/lib/config/env";

/**
 * Same-origin check for state-changing payment routes. These are plain
 * Route Handlers (not Server Actions, which get same-origin protection
 * automatically), so a POST from a foreign page must be rejected explicitly
 * — a forged cross-site POST must never be able to start or resolve a
 * payment attempt on someone else's invoice.
 */
export function isSameOriginRequest(request: Request): boolean {
  const appOrigin = new URL(env.APP_URL).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === appOrigin;

  // Some browsers omit `Origin` on a same-site POST; fall back to `Referer`.
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === appOrigin;
  } catch {
    return false;
  }
}

const RATE_LIMIT_WINDOW_MS = 30_000;
const RATE_LIMIT_MAX_REQUESTS = 5;

/**
 * Best-effort, in-memory, per-process cooldown — not a substitute for the
 * real protection here, which is `prepareInvoicePaymentAttempt`'s own
 * reuse/dedup logic (a rapid repeat click never triggers a second Paystack
 * call regardless of this). This just stops a single process from being
 * hammered; it resets on redeploy/cold start and isn't shared across
 * serverless instances, which is an accepted POC limitation.
 */
const requestTimestampsByKey = new Map<string, number[]>();

export function isRateLimited(key: string, now: number = Date.now()): boolean {
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (requestTimestampsByKey.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestTimestampsByKey.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  requestTimestampsByKey.set(key, timestamps);
  return false;
}
