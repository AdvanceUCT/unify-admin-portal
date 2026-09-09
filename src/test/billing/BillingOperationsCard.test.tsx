import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSummaryMock, runNowMock } = vi.hoisted(() => ({
  getSummaryMock: vi.fn(),
  runNowMock: vi.fn(),
}));

vi.mock("@/app/(admin)/settings/actions", () => ({
  getBillingOperationsSummaryAction: getSummaryMock,
  runBillingReconciliationNowAction: runNowMock,
}));

import { BillingOperationsCard } from "@/app/(admin)/settings/BillingOperationsCard";

const BASE_SUMMARY = {
  jobRuns: [{ jobType: "VENDOR_BILLING_DAILY", lastRunStatus: "COMPLETED", lastRunAtIso: "2026-09-13T00:05:00.000Z" }],
  unclaimedChargeCount: 4,
  pendingAttemptCount: 0,
  oldestPendingAttemptAgeSeconds: null,
  webhookFailureCount: 0,
  duplicatePaymentExceptionCount: 0,
  splitExceptionCount: 0,
  collectedTotalDisplay: "12.50",
  settlementNote: "Not applicable — test mode" as const,
};

describe("BillingOperationsCard", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("renders the initial summary", () => {
    render(<BillingOperationsCard initialSummary={BASE_SUMMARY} />);

    expect(screen.getByText("4 charge(s) not yet invoiced")).toBeInTheDocument();
    expect(screen.getByText("12.50")).toBeInTheDocument();
    expect(screen.getByText("Not applicable — test mode")).toBeInTheDocument();
  });

  it("updates the displayed numbers after Refresh", async () => {
    getSummaryMock.mockResolvedValue({ ...BASE_SUMMARY, unclaimedChargeCount: 9 });

    render(<BillingOperationsCard initialSummary={BASE_SUMMARY} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(screen.getByText("9 charge(s) not yet invoiced")).toBeInTheDocument());
  });

  it("updates the numbers after Run reconciliation now", async () => {
    runNowMock.mockResolvedValue({ ...BASE_SUMMARY, pendingAttemptCount: 0, duplicatePaymentExceptionCount: 2 });

    render(<BillingOperationsCard initialSummary={BASE_SUMMARY} />);
    fireEvent.click(screen.getByRole("button", { name: "Run reconciliation now" }));

    await waitFor(() => expect(runNowMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
  });

  it("shows an error message instead of crashing when the run fails (e.g. lease already held)", async () => {
    runNowMock.mockRejectedValue(new Error("A reconciliation run is already in progress."));

    render(<BillingOperationsCard initialSummary={BASE_SUMMARY} />);
    fireEvent.click(screen.getByRole("button", { name: "Run reconciliation now" }));

    expect(await screen.findByText(/already in progress/i)).toBeInTheDocument();
  });
});
