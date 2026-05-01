import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchIssuancePanel } from "@/features/credentials/BatchIssuancePanel";
import { getMockAdminState, resetMockActivationStore } from "@/lib/api/mockActivationStore";
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
    resetMockActivationStore();
    vi.unstubAllGlobals();
  });

  function mockAdminStateFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        return new Response(JSON.stringify(getMockAdminState()), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }),
    );
  }

  it("shows delivered activation links after queueing a batch", async () => {
    mockAdminStateFetch();
    render(<BatchIssuancePanel preview={preview} />);

    fireEvent.click(screen.getByRole("button", { name: "Queue batch" }));

    expect((await screen.findAllByText("Delivered")).length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue(/^unifywallet:\/\/activate\?token=/).length).toBeGreaterThan(0);
    expect(screen.getByText("credential-demo-097")).toBeInTheDocument();
  });

  it("handles denied clipboard permission without throwing", async () => {
    mockAdminStateFetch();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("Write permission denied.")),
      },
    });

    render(<BatchIssuancePanel preview={preview} />);

    fireEvent.click(screen.getByRole("button", { name: "Queue batch" }));
    await screen.findAllByDisplayValue(/^unifywallet:\/\/activate\?token=/);
    fireEvent.click(screen.getAllByRole("button", { name: "Copy" })[0]);

    expect(await screen.findByRole("button", { name: "Select link" })).toBeInTheDocument();
  });
});
