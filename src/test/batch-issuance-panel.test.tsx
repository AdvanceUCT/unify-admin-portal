import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchIssuancePanel } from "@/features/credentials/BatchIssuancePanel";
import { getMockAdminState, resetMockActivationStore } from "@/lib/api/mockActivationStore";
import type { BatchIssuancePreview } from "@/lib/api/types";

const routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}));

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
    routerPush.mockClear();
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

  it("previews and processes a batch run", async () => {
    mockAdminStateFetch();
    render(<BatchIssuancePanel preview={preview} />);

    expect(screen.getByRole("link", { name: "Batch history" })).toHaveAttribute(
      "href",
      "/credentials/issuance/batch/runs",
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview batch" }));
    expect(await screen.findByText(/100 eligible, 0 skipped from 100 matching students/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate 100 offers" }));

    await vi.waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith(expect.stringMatching(/^\/credentials\/issuance\/batch\/runs\/batch-\d+$/));
    });
    expect(screen.queryByRole("link", { name: "View run" })).not.toBeInTheDocument();
  });

  it("filters batch issuance by faculty before queueing", async () => {
    mockAdminStateFetch();
    render(<BatchIssuancePanel preview={preview} />);

    fireEvent.change(screen.getByLabelText("Faculty"), { target: { value: "Commerce" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview batch" }));
    expect(await screen.findByText(/17 eligible, 0 skipped from 17 matching students/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate 17 offers" }));

    await vi.waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith(expect.stringMatching(/^\/credentials\/issuance\/batch\/runs\/batch-\d+$/));
    });
    expect(screen.queryByText(/17 delivered, 0 failed, 0 skipped/)).not.toBeInTheDocument();
  });

  it("filters batch issuance by faculty and programme dropdowns", async () => {
    mockAdminStateFetch();
    render(<BatchIssuancePanel preview={preview} />);

    fireEvent.change(screen.getByLabelText("Faculty"), { target: { value: "Commerce" } });
    fireEvent.change(screen.getByLabelText("Programme"), { target: { value: "Bachelor of Accounting" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview batch" }));

    expect(await screen.findByText(/3 eligible, 0 skipped from 3 matching students/)).toBeInTheDocument();
    expect(screen.getAllByText("Commerce · Bachelor of Accounting")).toHaveLength(3);
  });

  it("keeps the preview table on screen until navigation occurs", async () => {
    mockAdminStateFetch();

    render(<BatchIssuancePanel preview={preview} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview batch" }));
    fireEvent.click(await screen.findByRole("button", { name: "Generate 100 offers" }));

    expect(await screen.findByText(/100 eligible, 0 skipped from 100 matching students/)).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(routerPush).toHaveBeenCalled();
    });
  });
});
