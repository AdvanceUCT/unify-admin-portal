import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchIssuancePanel } from "@/features/credentials/BatchIssuancePanel";
import type { BatchIssuancePreview } from "@/lib/api/types";

const preview: BatchIssuancePreview = {
  batchId: "batch-001",
  cohortId: "simulated-2026-cohort",
  requestedCount: 100,
  status: "Draft",
};

describe("BatchIssuancePanel", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows delivered activation links after queueing a batch", async () => {
    render(<BatchIssuancePanel preview={preview} />);

    fireEvent.click(screen.getByRole("button", { name: "Queue batch" }));

    expect(await screen.findByText("Delivered")).toBeInTheDocument();
    expect(screen.getByDisplayValue(/^unifywallet:\/\/activate\?token=/)).toBeInTheDocument();
    expect(screen.getByText("credential-demo-002")).toBeInTheDocument();
  });

  it("handles denied clipboard permission without throwing", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("Write permission denied.")),
      },
    });

    render(<BatchIssuancePanel preview={preview} />);

    fireEvent.click(screen.getByRole("button", { name: "Queue batch" }));
    await screen.findByDisplayValue(/^unifywallet:\/\/activate\?token=/);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(await screen.findByRole("button", { name: "Select link" })).toBeInTheDocument();
  });
});
