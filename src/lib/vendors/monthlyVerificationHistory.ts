/**
 * @fileoverview Aggregates completed vendor verifications into monthly totals.
 * @module lib/vendors/monthlyVerificationHistory
 */

import "server-only";

import { VendorVerificationBillingStatus } from "@/generated/prisma/enums";
import { getActiveVerificationPricing } from "@/lib/vendors/verificationBilling";
import { prisma } from "@/lib/db/prisma";

export const VENDOR_VERIFICATION_REPORT_TIME_ZONE = "Africa/Johannesburg";

const REPORTING_OFFSET_MS = 2 * 60 * 60 * 1000;

export type MonthlyVendorVerificationCount = {
  month: string;
  label: string;
  rowLabel: string;
  successfulVerifications: number;
  amountDueMinor: number;
  currency: string;
  isCurrentMonth: boolean;
};

export type VendorMonthlyVerificationHistory = {
  timezone: typeof VENDOR_VERIFICATION_REPORT_TIME_ZONE;
  selectedYear: number;
  availableYears: number[];
  currentMonth: MonthlyVendorVerificationCount;
  allTimeSuccessfulVerifications: number;
  months: MonthlyVendorVerificationCount[];
};

function monthKeyFromDate(date: Date) {
  const reportingDate = new Date(date.getTime() + REPORTING_OFFSET_MS);
  const year = reportingDate.getUTCFullYear();
  const month = String(reportingDate.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function parseMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);

  return { year, month };
}

function nextMonthKey(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function monthLabel(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);

  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: VENDOR_VERIFICATION_REPORT_TIME_ZONE,
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
}

function monthRowLabel(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);

  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: VENDOR_VERIFICATION_REPORT_TIME_ZONE,
  }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
}

function yearFromMonthKey(monthKey: string) {
  return parseMonthKey(monthKey).year;
}

function normalizedYear(value: number | undefined, availableYears: number[], currentYear: number) {
  return value && availableYears.includes(value) ? value : currentYear;
}

function buildMonthRange(startMonth: string, endMonth: string) {
  const months: string[] = [];

  for (let month = startMonth; month <= endMonth; month = nextMonthKey(month)) {
    months.push(month);
  }

  return months;
}

function monthsForYear(year: number, currentMonthKey: string) {
  const currentYear = yearFromMonthKey(currentMonthKey);
  const endMonth = year === currentYear ? currentMonthKey : `${year}-12`;

  return buildMonthRange(`${year}-01`, endMonth);
}

export async function getVendorMonthlyVerificationHistory(
  vendorProfileId: string,
  options: Date | { now?: Date; year?: number } = {},
): Promise<VendorMonthlyVerificationHistory> {
  const now = options instanceof Date ? options : options.now ?? new Date();
  const requestedYear = options instanceof Date ? undefined : options.year;
  const activePricing = getActiveVerificationPricing();
  const successfulVerifications = await prisma.vendorVerification.findMany({
    where: {
      vendorProfileId,
      status: "APPROVED",
      NOT: { isVerified: false },
      completedAt: { not: null },
    },
    select: {
      completedAt: true,
      billingStatus: true,
      verificationFeeCurrency: true,
      verificationFeeMinor: true,
    },
    orderBy: {
      completedAt: "asc",
    },
  });

  const currentMonthKey = monthKeyFromDate(now);
  const currentYear = yearFromMonthKey(currentMonthKey);
  const years = new Set<number>([currentYear]);
  const countsByMonth = new Map<string, number>();
  const amountDueByMonth = new Map<string, number>();
  const currencyByMonth = new Map<string, string>();

  for (const verification of successfulVerifications) {
    if (!verification.completedAt) continue;

    const month = monthKeyFromDate(verification.completedAt);
    years.add(yearFromMonthKey(month));
    countsByMonth.set(month, (countsByMonth.get(month) ?? 0) + 1);
    if (verification.billingStatus === VendorVerificationBillingStatus.BILLABLE) {
      amountDueByMonth.set(month, (amountDueByMonth.get(month) ?? 0) + verification.verificationFeeMinor);
      currencyByMonth.set(month, verification.verificationFeeCurrency);
    }
  }

  const availableYears = Array.from(years).sort((left, right) => right - left);
  const selectedYear = normalizedYear(requestedYear, availableYears, currentYear);
  const months = monthsForYear(selectedYear, currentMonthKey)
    .map((month) => ({
      amountDueMinor: amountDueByMonth.get(month) ?? 0,
      currency: currencyByMonth.get(month) ?? activePricing.currency,
      month,
      label: monthLabel(month),
      rowLabel: monthRowLabel(month),
      successfulVerifications: countsByMonth.get(month) ?? 0,
      isCurrentMonth: month === currentMonthKey,
    }))
    .reverse();

  const currentMonth = months.find((month) => month.isCurrentMonth) ?? {
    amountDueMinor: amountDueByMonth.get(currentMonthKey) ?? 0,
    currency: currencyByMonth.get(currentMonthKey) ?? activePricing.currency,
    month: currentMonthKey,
    label: monthLabel(currentMonthKey),
    rowLabel: monthRowLabel(currentMonthKey),
    successfulVerifications: 0,
    isCurrentMonth: true,
  };

  return {
    allTimeSuccessfulVerifications: successfulVerifications.length,
    availableYears,
    currentMonth,
    months,
    selectedYear,
    timezone: VENDOR_VERIFICATION_REPORT_TIME_ZONE,
  };
}
