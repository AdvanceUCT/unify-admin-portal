import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchInvoiceStatus, isSettledPaymentStatus, pollUntilSettled } from "@/app/vendor/(portal)/invoices/paymentPolling";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 401) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

describe("isSettledPaymentStatus", () => {
  it("treats PAID and NO_PAYMENT_REQUIRED as settled, UNPAID as not", () => {
    expect(isSettledPaymentStatus("PAID")).toBe(true);
    expect(isSettledPaymentStatus("NO_PAYMENT_REQUIRED")).toBe(true);
    expect(isSettledPaymentStatus("UNPAID")).toBe(false);
  });
});

describe("fetchInvoiceStatus", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the parsed status on a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ paymentStatus: "PAID", hasUnresolvedException: false })));

    await expect(fetchInvoiceStatus("invoice-1")).resolves.toEqual({ paymentStatus: "PAID", hasUnresolvedException: false });
  });

  it("gives a session-expiry-specific message on 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 401)));

    await expect(fetchInvoiceStatus("invoice-1")).rejects.toThrow(/session has expired/i);
  });

  it("gives a generic message on any other failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false, 500)));

    await expect(fetchInvoiceStatus("invoice-1")).rejects.toThrow(/unable to check/i);
  });
});

describe("pollUntilSettled", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stops as soon as a poll reports a settled status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ paymentStatus: "UNPAID", hasUnresolvedException: false }))
      .mockResolvedValueOnce(jsonResponse({ paymentStatus: "PAID", hasUnresolvedException: false }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = pollUntilSettled("invoice-1", { isCancelled: () => false });
    await vi.advanceTimersByTimeAsync(2_000); // first delay
    await vi.advanceTimersByTimeAsync(3_000); // second delay
    const result = await promise;

    expect(result).toEqual({ paymentStatus: "PAID", hasUnresolvedException: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null after exhausting all bounded delays without settling", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ paymentStatus: "UNPAID", hasUnresolvedException: false })));

    const promise = pollUntilSettled("invoice-1", { isCancelled: () => false });
    await vi.advanceTimersByTimeAsync(2_000 + 3_000 + 5_000 + 8_000 + 13_000);
    const result = await promise;

    expect(result).toBeNull();
  });

  it("stops early and makes no further fetch calls once cancelled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ paymentStatus: "UNPAID", hasUnresolvedException: false }));
    vi.stubGlobal("fetch", fetchMock);
    let cancelled = false;

    const promise = pollUntilSettled("invoice-1", { isCancelled: () => cancelled });
    cancelled = true;
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
