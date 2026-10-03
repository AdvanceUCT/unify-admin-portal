import { describe, expect, it } from "vitest";
import {
  academicPeriod,
  issuancePeriod,
  parseAnnualDate,
  parseRenewalOptions,
  renewalPreview,
} from "@/lib/credentials/academicPeriod";
const policy = { startMonth: 2, startDay: 1, expiryMonth: 11, expiryDay: 30 };
describe("institutional academic periods", () => {
  it("issues January and August credentials into the same academic year", () => {
    for (const date of ["2026-01-10T10:00:00Z", "2026-08-15T10:00:00Z"])
      expect(issuancePeriod(policy, new Date(date))).toMatchObject({
        academicYear: 2026,
        expiresAt: new Date("2026-11-30T22:00:00Z"),
      });
  });
  it("includes the complete expiry day and changes period at the exact boundary", () => {
    expect(
      issuancePeriod(policy, new Date("2026-11-30T21:59:59.999Z")).academicYear,
    ).toBe(2026);
    expect(
      issuancePeriod(policy, new Date("2026-11-30T22:00:00Z")).academicYear,
    ).toBe(2027);
  });
  it("supports academic years crossing December", () => {
    expect(
      issuancePeriod(
        { startMonth: 9, startDay: 1, expiryMonth: 6, expiryDay: 30 },
        new Date("2027-01-15T00:00:00Z"),
      ),
    ).toMatchObject({
      academicYear: 2026,
      start: new Date("2026-08-31T22:00:00Z"),
      expiresAt: new Date("2027-06-30T22:00:00Z"),
    });
  });
  it("clamps leap-day starts and expiries", () => {
    const leap = { startMonth: 2, startDay: 29, expiryMonth: 2, expiryDay: 29 };
    expect(academicPeriod(leap, 2027).start.toISOString()).toBe(
      "2027-02-27T22:00:00.000Z",
    );
    expect(academicPeriod(leap, 2028).expiresAt.toISOString()).toBe(
      "2028-02-29T22:00:00.000Z",
    );
  });
  it("counts the initial year in the allowance", () => {
    const preview = renewalPreview(policy, new Date("2026-01-10T10:00:00Z"), {
      autoRenew: true,
      renewalYears: 3,
    });
    expect(preview.finalYear).toBe(2028);
    expect(preview.renewalDates).toEqual([
      "2027-01-31T22:00:00.000Z",
      "2028-01-31T22:00:00.000Z",
    ]);
    expect(
      renewalPreview(policy, new Date("2026-01-10"), {
        autoRenew: true,
        renewalYears: 1,
      }).renewalDates,
    ).toEqual([]);
  });
  it("rejects invalid dates and durations", () => {
    expect(() => parseAnnualDate("02-30")).toThrow();
    expect(() => parseAnnualDate("13-01")).toThrow();
    expect(parseAnnualDate("02-29")).toEqual({ month: 2, day: 29 });
    for (const years of [0, -1, 1.5, 101, NaN])
      expect(() =>
        parseRenewalOptions({ autoRenew: true, renewalYears: years }),
      ).toThrow();
    expect(() => parseRenewalOptions({ autoRenew: "true" })).toThrow();
    expect(parseRenewalOptions({ autoRenew: false })).toEqual({
      autoRenew: false,
    });
  });
});

it("accepts day-month settings without swapping ambiguous dates", () => {
  expect(parseAnnualDate("01-02", "DD-MM")).toEqual({ month: 2, day: 1 });
  expect(parseAnnualDate("30-11", "DD-MM")).toEqual({ month: 11, day: 30 });
  expect(parseAnnualDate("29-02", "DD-MM")).toEqual({ month: 2, day: 29 });
  expect(() => parseAnnualDate("30-02", "DD-MM")).toThrow();
});


it("resolves September-January validity, including January's final day and subsequent renewals", () => {
  const september = { startMonth: 9, startDay: 1, expiryMonth: 1, expiryDay: 31 };
  expect(academicPeriod(september, 2026)).toEqual({ academicYear: 2026, start: new Date("2026-08-31T22:00:00Z"), expiresAt: new Date("2027-01-31T22:00:00Z") });
  const preview = renewalPreview(september, new Date("2026-10-03T10:00:00Z"), { autoRenew: true, renewalYears: 3 });
  expect(preview).toMatchObject({ academicYear: 2026, finalYear: 2028, expiresAt: "2027-01-31T22:00:00.000Z", renewalDates: ["2027-08-31T22:00:00.000Z", "2028-08-31T22:00:00.000Z"] });
  expect(issuancePeriod(september, new Date("2027-01-31T21:59:59.999Z")).academicYear).toBe(2026);
  expect(issuancePeriod(september, new Date("2027-01-31T22:00:00Z")).academicYear).toBe(2027);
  expect(issuancePeriod(september, new Date("2027-02-10T10:00:00Z"))).toMatchObject({ academicYear: 2027, expiresAt: new Date("2028-01-31T22:00:00Z") });
});
