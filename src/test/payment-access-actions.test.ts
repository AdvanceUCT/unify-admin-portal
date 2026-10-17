import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), submit: vi.fn(), save: vi.fn(), banks: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/vendors/context", () => ({ requireVendorOwnerContext: mocks.owner }));
vi.mock("@/lib/payments/branchOnboarding", () => ({ submitBranchPaymentApplication: mocks.submit }));
vi.mock("@/lib/vendors/payouts", () => ({ saveVendorPayoutDestination: mocks.save }));
vi.mock("@/lib/payments/banks", () => ({ payoutBanks: mocks.banks }));
import { getPayoutBanksAction, savePaymentAccessPayoutAction, submitPaymentAccessAction } from "@/app/vendor/(portal)/payments/access/actions";
const form = (values: Record<string,string>) => { const data = new FormData(); for (const [key,value] of Object.entries(values)) data.set(key,value); return data; };
beforeEach(() => { vi.clearAllMocks(); mocks.owner.mockResolvedValue({ session: { user: { id: "owner" } }, context: { vendorProfileId: "owned-vendor", role: "OWNER" } }); });
describe("owner payment-access actions", () => {
  it("derives vendor and actor identity from the session", async () => {
    mocks.submit.mockResolvedValue({ id: "request" });
    expect(await submitPaymentAccessAction({}, form({ vendorProfileId: "foreign", actorId: "attacker", branchId: "branch", payoutReference: "recipient", acknowledgement: "on" }))).toMatchObject({ ok: true });
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ vendorProfileId: "owned-vendor", actorId: "owner", expectedPayoutReference: "recipient" }));
  });
  it("keeps ambiguous submission recoverable and does not retry it", async () => {
    mocks.submit.mockRejectedValue(new Error("database password secret"));
    const result = await submitPaymentAccessAction({}, form({ branchId: "branch" }));
    expect(result).toMatchObject({ uncertain: true }); expect(JSON.stringify(result)).not.toContain("password"); expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
  it("validates bank choices on the server and returns no account numbers", async () => {
    mocks.banks.mockResolvedValue([{ code: "001", name: "Demo bank" }]);
    const result = await savePaymentAccessPayoutAction({}, form({ accountHolderName: "Demo", accountNumber: "1234567890", bankCode: "injected" }));
    expect(result.fieldErrors?.bankCode).toBeDefined(); expect(mocks.save).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain("1234567890");
  });
  it("retains authorization failures and returns a retryable safe bank-list error", async () => {
    mocks.owner.mockRejectedValueOnce(new Error("forbidden")); await expect(getPayoutBanksAction()).rejects.toThrow("forbidden");
    mocks.banks.mockRejectedValue(new Error("provider secret")); expect(await getPayoutBanksAction()).toEqual({ error: "Banks could not be loaded. Try again." });
  });
});
