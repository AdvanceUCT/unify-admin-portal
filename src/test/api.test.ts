import { describe, expect, it } from "vitest";
import { getBatchIssuancePreview, getStudents, getVendors } from "@/lib/api/client";

describe("admin mock client", () => {
  it("returns contract-shaped student credential data", async () => {
    const students = await getStudents();

    expect(students[0].credential.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(students[0].credential.lifecycleState).toBe("Active");
  });

  it("returns vendor approval data", async () => {
    const vendors = await getVendors();

    expect(vendors.map((vendor) => vendor.status)).toContain("Pending");
  });

  it("returns the planned MVP batch size", async () => {
    const preview = await getBatchIssuancePreview();

    expect(preview.requestedCount).toBe(100);
  });
});
