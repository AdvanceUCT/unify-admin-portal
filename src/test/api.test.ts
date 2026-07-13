import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __apiClientTestInternals,
  getBatchIssuancePreview,
  getStudents,
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

  it("returns the planned MVP batch size", async () => {
    const preview = await getBatchIssuancePreview();

    expect(preview.requestedCount).toBe(100);
  });

  it("builds server API origins from the current request host before env app urls", () => {
    expect(
      __apiClientTestInternals.requestOriginFromHeaders(
        new Headers({
          host: "voskuils.com",
          "x-forwarded-host": "unify-admin-preview.vercel.app",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toBe("https://unify-admin-preview.vercel.app");
  });

  it("normalizes Vercel deployment hostnames into https origins", () => {
    expect(__apiClientTestInternals.toHttpsOrigin("unify-admin-preview.vercel.app")).toBe(
      "https://unify-admin-preview.vercel.app",
    );
  });
});
