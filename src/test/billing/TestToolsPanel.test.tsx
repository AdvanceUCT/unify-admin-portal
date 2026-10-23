import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { seedMock, generateMock } = vi.hoisted(() => ({
  seedMock: vi.fn(),
  generateMock: vi.fn(),
}));

vi.mock("@/app/vendor/(portal)/test-tools/actions", () => ({
  seedOwnVerificationHistoryAction: seedMock,
  generateOwnInvoicesAction: generateMock,
}));

import { TestToolsPanel } from "@/app/vendor/(portal)/test-tools/TestToolsPanel";

const months = [
  { periodKey: "2026-10", label: "October 2026" },
  { periodKey: "2026-09", label: "September 2026" },
  { periodKey: "2026-08", label: "August 2026" },
  { periodKey: "2026-07", label: "July 2026" },
  { periodKey: "2026-06", label: "June 2026" },
];

describe("TestToolsPanel", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("seeds verification history with the entered count/months and shows the result", async () => {
    seedMock.mockResolvedValue({ created: 9 });

    render(<TestToolsPanel months={months} />);
    fireEvent.change(screen.getByLabelText("Count per run"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Seed verification history" }));

    await waitFor(() => expect(seedMock).toHaveBeenCalledWith(9, ["2026-09", "2026-08", "2026-07"]));
    expect(await screen.findByText(/created 9 verification/i)).toBeInTheDocument();
  });

  it("shows an error message instead of crashing when seeding fails", async () => {
    seedMock.mockRejectedValue(new Error("Something went wrong"));

    render(<TestToolsPanel months={months} />);
    fireEvent.click(screen.getByRole("button", { name: "Seed verification history" }));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("generates invoices and shows a summary of backfill + invoicing results", async () => {
    generateMock.mockResolvedValue({
      backfill: { scanned: 5, imported: 5, alreadyImported: 0, notBillable: 0, pending: 0, exceptions: 0, nextCursor: null },
      invoices: { vendorsScanned: 1, invoicesIssued: 2, zeroTotalInvoices: 0, skippedDisabled: false },
    });

    render(<TestToolsPanel months={months} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate invoices" }));

    await waitFor(() => expect(generateMock).toHaveBeenCalled());
    expect(await screen.findByText(/5 charge\(s\) created/i)).toBeInTheDocument();
    expect(await screen.findByText(/2 issued/i)).toBeInTheDocument();
  });

  it("surfaces when invoicing is disabled instead of silently reporting zero issued", async () => {
    generateMock.mockResolvedValue({
      backfill: { scanned: 0, imported: 0, alreadyImported: 0, notBillable: 0, pending: 0, exceptions: 0, nextCursor: null },
      invoices: { vendorsScanned: 0, invoicesIssued: 0, zeroTotalInvoices: 0, skippedDisabled: true },
    });

    render(<TestToolsPanel months={months} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate invoices" }));

    expect(await screen.findByText(/invoicing is disabled/i)).toBeInTheDocument();
  });

  it("seeds exactly the months that are ticked", async () => {
    seedMock.mockResolvedValue({ created: 12 });

    render(<TestToolsPanel months={months} />);
    fireEvent.click(screen.getByLabelText("August 2026"));
    fireEvent.click(screen.getByLabelText("October 2026"));
    fireEvent.click(screen.getByRole("button", { name: "Seed verification history" }));

    await waitFor(() => expect(seedMock).toHaveBeenCalledWith(12, ["2026-09", "2026-07", "2026-10"]));
  });

  it("disables seeding when no month is ticked", () => {
    render(<TestToolsPanel months={months} />);
    for (const label of ["September 2026", "August 2026", "July 2026"]) fireEvent.click(screen.getByLabelText(label));

    expect(screen.getByRole("button", { name: "Seed verification history" })).toBeDisabled();
  });

  it("reports when generated invoices are already overdue and verification is suspended", async () => {
    generateMock.mockResolvedValue({
      backfill: { scanned: 5, imported: 5, alreadyImported: 0, notBillable: 0, pending: 0, exceptions: 0, nextCursor: null },
      invoices: { vendorsScanned: 1, invoicesIssued: 3, zeroTotalInvoices: 0, skippedDisabled: false },
      verificationSuspended: true,
      agentSyncFailed: false,
    });

    render(<TestToolsPanel months={months} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate invoices" }));

    expect(await screen.findByText(/verification is now suspended at all your branches/i)).toBeInTheDocument();
  });
});
