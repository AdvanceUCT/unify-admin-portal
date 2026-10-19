import { afterEach, describe, expect, it, vi } from "vitest";
import { listSouthAfricanBanks } from "@/lib/paymentProviders/paystack/client";
const bank = { code: "001", name: "Demo bank", active: true, is_deleted: false, currency: "ZAR", type: "basa" };
afterEach(() => vi.unstubAllGlobals());
describe("South African payout bank catalogue", () => {
  it("follows cursors, deduplicates and returns only supported bank names and codes", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ status: true, data: [bank, { ...bank, code: "bad", currency: "NGN" }, { ...bank, code: "inactive", active: false }], meta: { next: "page-two" } })).mockResolvedValueOnce(Response.json({ status: true, data: [bank, { ...bank, code: "002", name: "Another bank" }], meta: { next: null } })); vi.stubGlobal("fetch", fetch);
    expect(await listSouthAfricanBanks("private-key", "https://api.paystack.co")).toEqual([{ code: "002", name: "Another bank" }, { code: "001", name: "Demo bank" }]);
    expect(fetch.mock.calls[0][0]).toContain("currency=ZAR"); expect(fetch.mock.calls[1][0]).toContain("next=page-two");
  });
  it("rejects malformed, empty and failed catalogues without guessing codes", async () => {
    for (const body of [{ status: true, data: [] }, { status: true, data: {} }, { status: false }]) { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body))); await expect(listSouthAfricanBanks("key", "https://provider.example")).rejects.toThrow(); }
  });
  it("stops repeated cursors and does not retry failed requests", async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json({ status: true, data: [bank], meta: { next: "same" } })); vi.stubGlobal("fetch", fetch);
    await expect(listSouthAfricanBanks("key", "https://provider.example")).rejects.toThrow("pagination"); expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockReset().mockRejectedValue(new Error("offline")); await expect(listSouthAfricanBanks("key", "https://provider.example")).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
