/** Annual calendar rules in Africa/Johannesburg (UTC+02, without DST). */
export type AnnualPeriodPolicy = {
  startMonth: number;
  startDay: number;
  expiryMonth: number;
  expiryDay: number;
};
export type RenewalOptions = { autoRenew?: boolean; renewalYears?: number };

export function parseRenewalOptions(value: unknown): RenewalOptions {
  const input = (value ?? {}) as Record<string, unknown>;
  if (input.autoRenew !== undefined && typeof input.autoRenew !== "boolean")
    throw new Error("Enable auto-renewal must be a boolean.");
  if (!input.autoRenew) return { autoRenew: false };
  const years = Number(input.renewalYears);
  if (!Number.isInteger(years) || years < 1 || years > 100)
    throw new Error("Academic years must be a whole number between 1 and 100.");
  return { autoRenew: true, renewalYears: years };
}

export function parseAnnualDate(
  value: string,
  format: "MM-DD" | "DD-MM" = "MM-DD",
) {
  const match = /^(\d{2})-(\d{2})$/.exec(value);
  if (!match)
    throw new Error(
      format === "DD-MM"
        ? "Use day-month dates, for example 01-02."
        : "Use month-day dates, for example 02-01.",
    );
  const month = Number(match[format === "DD-MM" ? 2 : 1]),
    day = Number(match[format === "DD-MM" ? 1 : 2]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(2000, month, 0)).getUTCDate()
  )
    throw new Error("The annual date is invalid.");
  return { month, day };
}

function midnight(year: number, month: number, day: number) {
  const clamped = Math.min(
    day,
    new Date(Date.UTC(year, month, 0)).getUTCDate(),
  );
  return new Date(Date.UTC(year, month - 1, clamped, -2));
}

export function academicPeriod(
  policy: AnnualPeriodPolicy,
  academicYear: number,
) {
  const crossesYear =
    policy.expiryMonth * 100 + policy.expiryDay <
    policy.startMonth * 100 + policy.startDay;
  const start = midnight(academicYear, policy.startMonth, policy.startDay);
  const expiresAt = new Date(
    midnight(
      academicYear + Number(crossesYear),
      policy.expiryMonth,
      policy.expiryDay,
    ).getTime() + 86_400_000,
  );
  return { academicYear, start, expiresAt };
}

export function issuancePeriod(policy: AnnualPeriodPolicy, now: Date) {
  const year = new Date(now.getTime() + 7_200_000).getUTCFullYear();
  for (let candidate = year - 1; candidate <= year + 1; candidate++) {
    const period = academicPeriod(policy, candidate);
    if (period.expiresAt > now) return period;
  }
  throw new Error("No unexpired academic period could be resolved.");
}

export function renewalPreview(
  policy: AnnualPeriodPolicy,
  now: Date,
  options: RenewalOptions,
) {
  const period = issuancePeriod(policy, now);
  const finalYear =
    period.academicYear + (options.autoRenew ? options.renewalYears! - 1 : 0);
  return {
    validFrom: now.toISOString(),
    expiresAt: period.expiresAt.toISOString(),
    academicYear: period.academicYear,
    finalYear,
    renewalDates: Array.from(
      { length: finalYear - period.academicYear },
      (_, index) =>
        academicPeriod(
          policy,
          period.academicYear + index + 1,
        ).start.toISOString(),
    ),
  };
}
