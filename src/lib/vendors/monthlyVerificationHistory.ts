/**
 * @fileoverview Aggregates completed vendor verifications into monthly totals.
 * @module lib/vendors/monthlyVerificationHistory
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";

export const VENDOR_VERIFICATION_REPORT_TIME_ZONE = "Africa/Johannesburg";

const REPORTING_OFFSET_MS = 2 * 60 * 60 * 1000;

export type MonthlyVendorVerificationCount = {
  month: string;
  label: string;
  successfulVerifications: number;
  isCurrentMonth: boolean;
};

export type VendorMonthlyVerificationHistory = {
  timezone: typeof VENDOR_VERIFICATION_REPORT_TIME_ZONE;
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

function buildMonthRange(startMonth: string, endMonth: string) {
  const months: string[] = [];

  for (let month = startMonth; month <= endMonth; month = nextMonthKey(month)) {
    months.push(month);
  }

  return months;
}

export async function getVendorMonthlyVerificationHistory(
  vendorProfileId: string,
  now = new Date(),
): Promise<VendorMonthlyVerificationHistory> {
  const successfulVerifications = await prisma.vendorVerification.findMany({
    where: {
      vendorProfileId,
      status: "APPROVED",
      isVerified: true,
      completedAt: { not: null },
    },
    select: {
      completedAt: true,
    },
    orderBy: {
      completedAt: "asc",
    },
  });

  const currentMonthKey = monthKeyFromDate(now);
  const firstSuccessfulMonth = successfulVerifications[0]?.completedAt
    ? monthKeyFromDate(successfulVerifications[0].completedAt)
    : currentMonthKey;
  const startMonth = firstSuccessfulMonth > currentMonthKey
    ? currentMonthKey
    : firstSuccessfulMonth;
  const countsByMonth = new Map<string, number>();

  for (const verification of successfulVerifications) {
    if (!verification.completedAt) continue;

    const month = monthKeyFromDate(verification.completedAt);
    countsByMonth.set(month, (countsByMonth.get(month) ?? 0) + 1);
  }

  const months = buildMonthRange(startMonth, currentMonthKey)
    .map((month) => ({
      month,
      label: monthLabel(month),
      successfulVerifications: countsByMonth.get(month) ?? 0,
      isCurrentMonth: month === currentMonthKey,
    }))
    .reverse();

  const currentMonth = months.find((month) => month.isCurrentMonth) ?? {
    month: currentMonthKey,
    label: monthLabel(currentMonthKey),
    successfulVerifications: 0,
    isCurrentMonth: true,
  };

  return {
    timezone: VENDOR_VERIFICATION_REPORT_TIME_ZONE,
    currentMonth,
    allTimeSuccessfulVerifications: successfulVerifications.length,
    months,
  };
}
