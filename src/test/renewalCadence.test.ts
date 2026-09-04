import { describe, expect, it } from "vitest";

import { addCalendarMonthsClamped, nextRenewalAt, renewalCandidateCutoff } from "@/lib/credentials/renewalCadence";

describe("renewal cadence", () => {
  it("clamps month-end dates instead of overflowing", () => {
    expect(addCalendarMonthsClamped(new Date("2027-01-31T12:00:00.000Z"), 1).toISOString())
      .toBe("2027-02-28T12:00:00.000Z");
    expect(addCalendarMonthsClamped(new Date("2028-01-31T12:00:00.000Z"), 1).toISOString())
      .toBe("2028-02-29T12:00:00.000Z");
  });

  it("calculates renewal from the issuance timestamp", () => {
    expect(nextRenewalAt(new Date("2026-09-04T08:30:00.000Z"), 6).toISOString())
      .toBe("2027-03-04T08:30:00.000Z");
  });

  it("includes the whole source month before applying exact month-end due dates", () => {
    const now = new Date("2026-02-28T12:00:00.000Z");
    expect(renewalCandidateCutoff(now, 1)).toEqual(new Date("2026-01-31T23:59:59.999Z"));
    expect(nextRenewalAt(new Date("2026-01-31T12:00:00.000Z"), 1) <= now).toBe(true);
  });
});
