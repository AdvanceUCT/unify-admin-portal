import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refreshMock, pollUntilSettledMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  pollUntilSettledMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));
vi.mock("@/app/vendor/(portal)/invoices/paymentPolling", () => ({
  pollUntilSettled: pollUntilSettledMock,
  isSettledPaymentStatus: (status: string) => status === "PAID" || status === "NO_PAYMENT_REQUIRED",
}));

import { PaymentReturnStatus } from "@/app/vendor/(portal)/invoices/[invoiceId]/payment-return/PaymentReturnStatus";

function jsonResponse(body: unknown = {}) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}

describe("PaymentReturnStatus", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("reconciles server-side on mount without trusting any client-supplied reference, then shows confirmed once settled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse());
    vi.stubGlobal("fetch", fetchMock);
    pollUntilSettledMock.mockResolvedValue({ paymentStatus: "PAID", hasUnresolvedException: false });

    render(<PaymentReturnStatus invoiceId="invoice-1" />);

    expect(screen.getByText(/confirming your payment/i)).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/vendor/invoices/invoice-1/reconcile", { method: "POST" }));
    expect(await screen.findByText(/payment confirmed/i)).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows a pending message rather than a false success when polling times out unsettled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse()));
    pollUntilSettledMock.mockResolvedValue(null);

    render(<PaymentReturnStatus invoiceId="invoice-1" />);

    expect(await screen.findByText(/still confirming/i)).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("does not confirm success on a browser reconcile-call failure alone — the webhook may still settle it", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", fetchMock);
    pollUntilSettledMock.mockResolvedValue(null);

    render(<PaymentReturnStatus invoiceId="invoice-1" />);

    expect(await screen.findByText(/still confirming/i)).toBeInTheDocument();
  });

  it("links back to the invoice detail page", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse()));
    pollUntilSettledMock.mockResolvedValue(null);

    render(<PaymentReturnStatus invoiceId="invoice-1" />);

    expect(screen.getByRole("link", { name: /back to invoice/i })).toHaveAttribute("href", "/vendor/invoices/invoice-1");
  });
});
