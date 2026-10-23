import { describe, expect, it } from "vitest";
import { formatSastDateTime, sastDateKey, sastDayBoundary, sastInputToUtc, sastIsoTimestamp } from "@/lib/formatters/time";
describe("SAST presentation and input boundaries", () => {
  it.each(["UTC", "America/Los_Angeles", "Asia/Tokyo"])("does not depend on server timezone %s", timezone => {
    const previous = process.env.TZ;
    process.env.TZ = timezone;
    try {
      expect(sastDateKey("2026-12-31T22:30:00Z")).toBe("2027-01-01");
      expect(formatSastDateTime("2026-12-31T22:30:00Z")).toContain("00:30");
      expect(sastIsoTimestamp("2026-12-31T22:30:00Z")).toBe("2027-01-01T00:30:00.000+02:00");
      expect(sastDayBoundary("2027-01-01")?.toISOString()).toBe("2026-12-31T22:00:00.000Z");
      expect(sastDayBoundary("2027-01-01", true)?.toISOString()).toBe("2027-01-01T22:00:00.000Z");
      expect(sastInputToUtc("2027-01-01T00:30")).toBe("2026-12-31T22:30:00.000Z");
      expect(new Date("2026-12-31T22:30:00Z").toISOString()).toBe("2026-12-31T22:30:00.000Z");
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  });
  it("validates calendar inputs without shifting date-only values", () => {
    expect(sastDayBoundary("2026-02-29")).toBeUndefined();
    expect(sastDayBoundary("2028-02-29")).toBeDefined();
    expect(() => sastInputToUtc("2026-01-01T24:00")).toThrow();
  });
});
