/**
 * @fileoverview Shared non-secret constants for vendor verification invoicing.
 * @module lib/billing/constants
 */

export const VENDOR_INVOICE_NUMBER_PREFIX = "DEMO" as const;

/** POC implementation default per the handoff — not yet configurable per university. */
export const INVOICE_CLOSING_DELAY_SECONDS = 3600;

/** Safety bound: at most this many invoices are issued for one vendor per generation run. */
export const MAX_INVOICES_PER_VENDOR_PER_RUN = 24;
