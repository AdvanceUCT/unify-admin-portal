import { describe, expect, it } from "vitest";
import { formatCredentialStatus, formatDateTime, formatMoney, formatPaymentStatus } from "@/lib/formatters";

describe("formatters", () => {
  it("formats decimal-string money as rand", () => {
    expect(formatMoney("42.50")).toContain("42,50");
  });

  it("formats ISO timestamps", () => {
    expect(formatDateTime("2026-01-01T00:00:00Z")).toContain("2026");
  });

  it("formats credential and payment statuses", () => {
    expect(formatCredentialStatus("Active")).toBe("Active");
    expect(formatPaymentStatus("Approved")).toBe("Approved");
  });
});
