import { beforeEach, describe, expect, it, vi } from "vitest";
import { verificationWebhookHistory } from "@/lib/vendors/verificationWebhookHistory";
import { GET } from "@/app/api/vendor/integrations/webhook/history/route";
const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), findMany: vi.fn(), owner: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { vendorWebhookDelivery: { findFirst: mocks.findFirst, findMany: mocks.findMany } } }));
vi.mock("@/lib/vendors/routeAuth", () => ({ vendorFromPortalSession: mocks.owner }));
function attempt(id: string, status = "FAILED") { return { id, attemptNumber: 1, status, responseStatus: null, errorMessage: "private remote error", attemptedAt: new Date("2026-10-07T10:00:00Z"), vendorVerification: { id: "verification", verificationRequestId: "request", checkoutId: "order", status: "APPROVED", attributes: { name: "Private student" } } }; }
beforeEach(() => { vi.clearAllMocks(); mocks.findFirst.mockResolvedValue(null); mocks.findMany.mockResolvedValue([]); mocks.owner.mockResolvedValue({ id: "vendor" }); });
describe("verification callback history", () => {
  it("projects safe fields and pages without exposing stored errors or attributes", async () => {
    mocks.findMany.mockResolvedValue([attempt("b"), attempt("a")]);
    const result = await verificationWebhookHistory("vendor", new URLSearchParams("limit=1"));
    expect(result.items).toHaveLength(1); expect(result.nextCursor).toBe("b");
    expect(result.items[0]).toMatchObject({ checkoutId: "order", httpStatus: null, failureReason: "Receiver could not be reached." });
    expect(JSON.stringify(result)).not.toMatch(/private remote error|Private student|attributes|errorMessage/);
    expect(mocks.findMany.mock.calls[0][0].where.vendorVerification.vendorProfileId).toBe("vendor");
    expect(mocks.findMany.mock.calls[0][0].select.vendorVerification.select).not.toHaveProperty("attributes");
  });
  it("rejects foreign and missing cursors before reading rows", async () => {
    await expect(verificationWebhookHistory("vendor", new URLSearchParams("cursor=foreign"))).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({ id: "foreign", vendorVerification: { vendorProfileId: "vendor" } });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("uses a stable timestamp and ID boundary for tied attempt times", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "b", attemptedAt: new Date("2026-10-07T10:00:00Z") });
    await verificationWebhookHistory("vendor", new URLSearchParams("cursor=b"));
    expect(mocks.findMany.mock.calls[0][0].where.OR).toEqual([{ attemptedAt: { lt: new Date("2026-10-07T10:00:00Z") } }, { attemptedAt: new Date("2026-10-07T10:00:00Z"), id: { lt: "b" } }]);
  });
  it.each(["limit=0", "limit=51", "limit=abc", "cursor=", "extra=invalid"])("rejects invalid query %s", async query => {
    await expect(verificationWebhookHistory("vendor", new URLSearchParams(query))).rejects.toThrow();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("requires owner access and disables response caching", async () => {
    mocks.owner.mockResolvedValueOnce(null);
    expect((await GET(new Request("https://portal.example/api/vendor/integrations/webhook/history"))).status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
    const response = await GET(new Request("https://portal.example/api/vendor/integrations/webhook/history"));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ items: [], nextCursor: null, lastSuccess: null });
  });
});
