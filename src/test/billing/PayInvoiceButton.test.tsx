import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ResumeCallbacks = { onSuccess?: (event: { id: number; reference: string; message: string }) => void; onCancel?: () => void; onError?: (event: { message: string }) => void };

const { refreshMock, pollUntilSettledMock, resumeTransactionMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  pollUntilSettledMock: vi.fn(),
  resumeTransactionMock: vi.fn<(accessCode: string, callbacks: ResumeCallbacks) => void>(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

vi.mock("@/app/vendor/(portal)/invoices/paymentPolling", () => ({
  pollUntilSettled: pollUntilSettledMock,
  fetchInvoiceStatus: vi.fn(),
  isSettledPaymentStatus: (status: string) => status === "PAID" || status === "NO_PAYMENT_REQUIRED",
}));

vi.mock("@paystack/inline-js", () => ({
  default: class {
    resumeTransaction(accessCode: string, callbacks: ResumeCallbacks) {
      resumeTransactionMock(accessCode, callbacks);
    }
  },
}));

import { PayInvoiceButton } from "@/app/vendor/(portal)/invoices/[invoiceId]/PayInvoiceButton";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response);
}

describe("PayInvoiceButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens the Paystack popup with the server-issued access code on click", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ status: "READY", accessCode: "code-x", authorizationUrl: "https://checkout.paystack.com/x", reference: "unify-inv-abc" })),
    );

    render(<PayInvoiceButton invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Pay invoice" }));

    await waitFor(() => expect(resumeTransactionMock).toHaveBeenCalledWith("code-x", expect.any(Object)));
  });

  it("shows the hosted-checkout fallback link using the server-validated authorization URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ status: "READY", accessCode: "code-x", authorizationUrl: "https://checkout.paystack.com/x", reference: "unify-inv-abc" })),
    );

    render(<PayInvoiceButton invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Pay invoice" }));

    const link = await screen.findByRole("link", { name: /pay via this link instead/i });
    expect(link).toHaveAttribute("href", "https://checkout.paystack.com/x");
  });

  it("on popup success, reconciles server-side, polls, and refreshes once settled — a popup success alone never shows Paid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "READY", accessCode: "code-x", authorizationUrl: "https://x", reference: "unify-inv-abc" })) // payment-attempts
      .mockResolvedValueOnce(jsonResponse({})); // reconcile
    vi.stubGlobal("fetch", fetchMock);
    pollUntilSettledMock.mockResolvedValue({ paymentStatus: "PAID", hasUnresolvedException: false });

    render(<PayInvoiceButton invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Pay invoice" }));
    await waitFor(() => expect(resumeTransactionMock).toHaveBeenCalled());

    const callbacks = resumeTransactionMock.mock.calls[0][1];
    // Before the popup's onSuccess fires, nothing has been reconciled yet.
    expect(refreshMock).not.toHaveBeenCalled();

    callbacks.onSuccess?.({ id: 1, reference: "unify-inv-abc", message: "ok" });

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/vendor/invoices/invoice-1/reconcile", { method: "POST" });
    expect(pollUntilSettledMock).toHaveBeenCalled();
  });

  it("returns to idle with a message on popup cancellation, allowing another attempt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ status: "READY", accessCode: "code-x", authorizationUrl: "https://x", reference: "unify-inv-abc" })),
    );

    render(<PayInvoiceButton invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Pay invoice" }));
    await waitFor(() => expect(resumeTransactionMock).toHaveBeenCalled());

    resumeTransactionMock.mock.calls[0][1].onCancel?.();

    expect(await screen.findByText(/payment was cancelled/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay invoice" })).toBeEnabled();
  });

  it("shows the popup's own error message and does not treat it as settled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ status: "READY", accessCode: "code-x", authorizationUrl: "https://x", reference: "unify-inv-abc" })),
    );

    render(<PayInvoiceButton invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Pay invoice" }));
    await waitFor(() => expect(resumeTransactionMock).toHaveBeenCalled());

    resumeTransactionMock.mock.calls[0][1].onError?.({ message: "Card declined." });

    expect(await screen.findByText("Card declined.")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("surfaces a server-side rejection (e.g. already paid) without opening a popup", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { message: "Already paid.", code: "INVOICE_NOT_PAYABLE" } }, false, 409)));

    render(<PayInvoiceButton invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Pay invoice" }));

    expect(await screen.findByText("Already paid.")).toBeInTheDocument();
    expect(resumeTransactionMock).not.toHaveBeenCalled();
  });

  it("shows a distinct message for an ambiguous UNKNOWN outcome instead of a generic error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status: "UNKNOWN", accessCode: null, authorizationUrl: null, reference: "unify-inv-abc" })));

    render(<PayInvoiceButton invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Pay invoice" }));

    expect(await screen.findByText(/couldn't confirm the payment started/i)).toBeInTheDocument();
    expect(resumeTransactionMock).not.toHaveBeenCalled();
  });

  it("disables the button while a request is in flight, preventing a double-click double-charge attempt", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; })),
    );

    render(<PayInvoiceButton invoiceId="invoice-1" />);
    const button = screen.getByRole("button", { name: "Pay invoice" });
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());

    resolveFetch(await jsonResponse({ status: "READY", accessCode: "code-x", authorizationUrl: "https://x", reference: "unify-inv-abc" }));
  });

  it("shows Refresh status once bounded polling ends without settling, without an infinite spinner", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "READY", accessCode: "code-x", authorizationUrl: "https://x", reference: "unify-inv-abc" }))
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    pollUntilSettledMock.mockResolvedValue(null); // bounded window elapsed, nothing settled

    render(<PayInvoiceButton invoiceId="invoice-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Pay invoice" }));
    await waitFor(() => expect(resumeTransactionMock).toHaveBeenCalled());
    resumeTransactionMock.mock.calls[0][1].onSuccess?.({ id: 1, reference: "unify-inv-abc", message: "ok" });

    expect(await screen.findByRole("button", { name: "Refresh status" })).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
