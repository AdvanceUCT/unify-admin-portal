import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), dispatch: vi.fn(), after: vi.fn(), authorize: vi.fn() }));
vi.mock("next/server", async importOriginal => ({ ...await importOriginal<typeof import("next/server")>(), after: mocks.after }));
vi.mock("@/lib/auth/session", () => ({ getCurrentAdminSession: async () => ({ user: { id: "admin-1" } }), getSessionForAudit: async () => ({ actorId: "admin-1" }) }));
vi.mock("@/lib/auth/permissions", () => ({ assertCan: mocks.authorize, PermissionError: class extends Error { status = 403; } }));
vi.mock("@/lib/issuance/batchRuns", () => ({ listBatchRuns: vi.fn(), createQueuedBatchRun: mocks.create, processBatchRunInBackground: mocks.dispatch }));
vi.mock("@/lib/issuance/batchIssuance", () => ({ parseBatchIssuanceSelection: (value: unknown) => value,
  StudentIssuanceError: class extends Error { constructor(message: string, public status: number) { super(message); } },
}));
import { POST } from "@/app/api/credentials/issuance/batch/runs/route";

beforeEach(() => { vi.clearAllMocks(); mocks.authorize.mockImplementation(() => undefined); mocks.create.mockResolvedValue({ batchId: "batch-queued", status: "Queued" }); });

describe("batch submission API", () => {
  it("returns 202 and a polling location before starting the agent", async () => {
    const request = new Request("https://portal.example/api/credentials/issuance/batch/runs", {
      method: "POST", body: JSON.stringify({ faculty: "Science" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(202);
    expect(response.headers.get("Location")).toBe("/api/credentials/issuance/batch/runs/batch-queued");
    expect(await response.json()).toEqual({ batchId: "batch-queued", status: "Queued" });
    expect(mocks.create).toHaveBeenCalledWith({ actorId: "admin-1", selection: { faculty: "Science" } });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.dispatch).toHaveBeenCalledWith("batch-queued");
  });
  it("does not schedule processing when saving the run fails", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Database unavailable"));
    expect((await POST(new Request("https://portal.example", { method: "POST", body: "{}" }))).status).toBe(502);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
