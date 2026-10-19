import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), can: vi.fn(), approve: vi.fn(), reject: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole: mocks.session }));
vi.mock("@/lib/auth/permissions", () => ({ assertCan: mocks.can }));
vi.mock("@/lib/payments/branchOnboarding", () => ({ approveBranchPaymentApplication: mocks.approve, rejectBranchPaymentApplication: mocks.reject }));
import { approvePaymentAccessAction, rejectPaymentAccessAction } from "@/app/(admin)/vendors/payment-access/actions";
const form = () => { const data = new FormData(); data.set("applicationId", "application"); data.set("payoutReference", "displayed-account"); data.set("notes", "Update the branch address."); return data; };
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ user: { id: "reviewer" } }); });
describe("payment-access review actions", () => {
  it("requires administrator permission and binds the displayed account", async () => {
    expect(await approvePaymentAccessAction({}, form())).toMatchObject({ ok: true });
    expect(mocks.session).toHaveBeenCalledWith(["SUPER_ADMIN", "ADMIN"]); expect(mocks.can).toHaveBeenCalledWith("vendor:write", expect.anything());
    expect(mocks.approve).toHaveBeenCalledWith({ applicationId: "application", reviewerId: "reviewer", expectedPayoutReference: "displayed-account" });
  });
  it("returns stale-account errors inline and never retries an ambiguous decision", async () => {
    mocks.approve.mockRejectedValueOnce(new Error("The payout account changed. Reload.")); expect(await approvePaymentAccessAction({}, form())).toEqual({ error: "The payout account changed. Reload." });
    mocks.approve.mockRejectedValueOnce(new Error("private database details")); const result = await approvePaymentAccessAction({}, form()); expect(result).toMatchObject({ uncertain: true }); expect(JSON.stringify(result)).not.toContain("database details"); expect(mocks.approve).toHaveBeenCalledTimes(2);
  });
  it("passes vendor-visible feedback and denies unauthorized review", async () => {
    expect(await rejectPaymentAccessAction({}, form())).toMatchObject({ ok: true }); expect(mocks.reject).toHaveBeenCalledWith({ applicationId: "application", reviewerId: "reviewer", notes: "Update the branch address." });
    mocks.can.mockImplementationOnce(() => { throw new Error("forbidden"); }); await expect(approvePaymentAccessAction({}, form())).rejects.toThrow("forbidden"); expect(mocks.approve).not.toHaveBeenCalled();
  });
});
