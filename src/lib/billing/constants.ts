/**
 * @fileoverview Shared non-secret constants for vendor verification invoicing.
 * @module lib/billing/constants
 */

export const VENDOR_INVOICE_NUMBER_PREFIX = "DEMO" as const;

/** POC implementation default per the handoff — not yet configurable per university. */
export const INVOICE_CLOSING_DELAY_SECONDS = 3600;

/** Safety bound: at most this many invoices are issued for one vendor per generation run. */
export const MAX_INVOICES_PER_VENDOR_PER_RUN = 24;

/**
 * A READY/PENDING/UNKNOWN attempt with a stored access code is reused as-is
 * (no new Paystack call) while still inside this window, matching Paystack's
 * documented checkout-session lifetime with margin to spare. Past it, a new
 * Pay click prepares a fresh attempt instead of resuming a likely-expired one.
 */
export const PAYMENT_ATTEMPT_REUSE_WINDOW_SECONDS = 55 * 60;

/**
 * A PREPARING attempt older than this had its process crash between
 * committing the DB row and calling Paystack (or between calling Paystack
 * and persisting the result) — it's abandoned rather than left blocking new
 * attempts forever.
 */
export const PAYMENT_ATTEMPT_STALE_PREPARING_SECONDS = 120;

export const PAYSTACK_PROVIDER_NAME = "paystack" as const;

/** `BillingRun.jobType` values — also the lease key, so each names one exclusive job. */
export const BILLING_JOB_TYPE_DAILY = "VENDOR_BILLING_DAILY" as const;
export const BILLING_JOB_TYPE_RECONCILE = "VENDOR_BILLING_RECONCILE" as const;
export const BILLING_JOB_TYPE_BACKFILL = "VERIFICATION_CHARGE_BACKFILL" as const;
