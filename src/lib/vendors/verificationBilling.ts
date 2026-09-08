/**
 * @fileoverview Resolves platform-controlled verification billing snapshots.
 * @module lib/vendors/verificationBilling
 */

import "server-only";

import {
  VendorVerificationBillingStatus,
  type VendorVerificationStatus,
} from "@/generated/prisma/enums";
import { env } from "@/lib/config/env";

export const VERIFICATION_BILLING_TIME_ZONE = "Africa/Johannesburg";

const REPORTING_OFFSET_MS = 2 * 60 * 60 * 1000;

export type VerificationPricing = {
  feeMinor: number;
  currency: string;
};

export type VerificationBillingSnapshot = {
  billingStatus: VendorVerificationBillingStatus;
  verificationFeeMinor: number;
  verificationFeeCurrency: string;
  billingPeriodKey: string | null;
  pricingSnapshotAt: Date | null;
  billingReason: string | null;
};

export function billingPeriodKeyFromDate(date: Date) {
  const reportingDate = new Date(date.getTime() + REPORTING_OFFSET_MS);
  const year = reportingDate.getUTCFullYear();
  const month = String(reportingDate.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

export function billingPeriodLabel(periodKey: string) {
  const [year, month] = periodKey.split("-").map(Number);

  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: VERIFICATION_BILLING_TIME_ZONE,
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
}

export function getActiveVerificationPricing(): VerificationPricing {
  return {
    currency: env.VERIFICATION_FEE_CURRENCY,
    feeMinor: env.VERIFICATION_FEE_MINOR,
  };
}

function notBillableReason(status: VendorVerificationStatus, isVerified: boolean | null | undefined) {
  if (status === "APPROVED" && isVerified === false) return "NOT_VERIFIED";
  return status;
}

export function resolveVerificationBillingSnapshot({
  completedAt,
  isVerified,
  pricing = getActiveVerificationPricing(),
  status,
}: {
  completedAt?: Date | null;
  isVerified?: boolean | null;
  pricing?: VerificationPricing;
  status: VendorVerificationStatus;
}): VerificationBillingSnapshot {
  if (status === "PENDING") {
    return {
      billingPeriodKey: null,
      billingReason: "PENDING",
      billingStatus: VendorVerificationBillingStatus.PENDING,
      pricingSnapshotAt: null,
      verificationFeeCurrency: pricing.currency,
      verificationFeeMinor: 0,
    };
  }

  if (!completedAt) {
    return {
      billingPeriodKey: null,
      billingReason: "MISSING_COMPLETED_AT",
      billingStatus: VendorVerificationBillingStatus.NOT_BILLABLE,
      pricingSnapshotAt: new Date(),
      verificationFeeCurrency: pricing.currency,
      verificationFeeMinor: 0,
    };
  }

  const billingPeriodKey = billingPeriodKeyFromDate(completedAt);

  if (status === "APPROVED" && isVerified !== false) {
    return {
      billingPeriodKey,
      billingReason: "APPROVED_VERIFICATION",
      billingStatus: VendorVerificationBillingStatus.BILLABLE,
      pricingSnapshotAt: new Date(),
      verificationFeeCurrency: pricing.currency,
      verificationFeeMinor: pricing.feeMinor,
    };
  }

  return {
    billingPeriodKey,
    billingReason: notBillableReason(status, isVerified),
    billingStatus: VendorVerificationBillingStatus.NOT_BILLABLE,
    pricingSnapshotAt: new Date(),
    verificationFeeCurrency: pricing.currency,
    verificationFeeMinor: 0,
  };
}
