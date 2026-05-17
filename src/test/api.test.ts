import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBatchIssuancePreview,
  getStudents,
  getVendors,
} from "@/lib/api/client";
import { mockStudents } from "@/lib/api/mockData";
import { resetMockActivationStore } from "@/lib/api/mockActivationStore";

describe("admin mock client", () => {
  afterEach(() => {
    resetMockActivationStore();
    vi.unstubAllGlobals();
  });

  function mockJsonFetch(data: unknown) {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }),
    );

    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("returns contract-shaped student credential data", async () => {
    const fetchMock = mockJsonFetch(mockStudents);
    const students = await getStudents();

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/students");
    expect(students[0].credential.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(students[0].credential.lifecycleState).toBe("NOT_ISSUED");
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
