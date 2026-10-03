import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn(),
  overview: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentAdminSession: mocks.session,
}));
vi.mock("@/lib/credentials/annualRenewals", () => ({
  cancelRenewalEnrolment: mocks.cancel,
  retryAnnualRenewal: mocks.retry,
}));
vi.mock("@/lib/credentials/renewalOverview", () => ({
  renewalOverview: mocks.overview,
}));
vi.mock("@/lib/credentials/validityPolicy", () => ({
  currentValidityPolicy: vi.fn(async () => ({
    startMonth: 2,
    startDay: 1,
    expiryMonth: 11,
    expiryDay: 30,
  })),
}));
import { POST } from "@/app/api/credentials/renewals/[id]/[action]/route";
import { GET } from "@/app/api/credentials/renewals/route";
import { GET as preview } from "@/app/api/credentials/renewals/preview/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
});
const request = new Request("http://localhost/api/credentials/renewals");
const params = (action: string) => ({
  params: Promise.resolve({ id: "record-1", action }),
});
it("requires authentication for reads and writes", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await GET(request)).status).toBe(401);
  expect((await POST(request, params("cancel"))).status).toBe(401);
});
it("allows issuer reads while rejecting issuer cancellation and recovery", async () => {
  mocks.session.mockResolvedValue({ user: { id: "issuer", role: "ISSUER" } });
  mocks.overview.mockResolvedValue({ records: [] });
  expect((await GET(request)).status).toBe(200);
  for (const action of ["cancel", "retry", "replace"])
    expect((await POST(request, params(action))).status).toBe(403);
  expect(mocks.cancel).not.toHaveBeenCalled();
  expect(mocks.retry).not.toHaveBeenCalled();
});
it("records the administrator on cancellation and recovery", async () => {
  expect((await POST(request, params("cancel"))).status).toBe(200);
  expect(mocks.cancel).toHaveBeenCalledWith("record-1", "admin-1");
  expect((await POST(request, params("replace"))).status).toBe(200);
  expect(mocks.retry).toHaveBeenCalledWith("record-1", "admin-1", true);
});
it("rejects invalid preview durations", async () => {
  expect(
    (
      await preview(
        new Request(
          "http://localhost/api/credentials/renewals/preview?autoRenew=true&renewalYears=0",
        ),
      )
    ).status,
  ).toBe(400);
});
