import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkAgentStatusAction: vi.fn(),
  createOrGetDidAction: vi.fn(),
  refresh: vi.fn(),
  saveProfileAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/app/(auth)/setup/actions", () => ({
  checkAgentStatusAction: mocks.checkAgentStatusAction,
  createOrGetDidAction: mocks.createOrGetDidAction,
  saveProfileAction: mocks.saveProfileAction,
}));

import { SetupWizard, type SetupProfile } from "@/features/setup/SetupWizard";

const savedProfile: SetupProfile = {
  abbreviation: "UEX",
  contactEmail: "admin@example.edu",
  id: "profile-1",
  issuerDid: null,
  logoUrl: null,
  name: "University of Example",
  setupCompletedAt: null,
  setupStatus: "PENDING",
};

const completeProfile: SetupProfile = {
  ...savedProfile,
  issuerDid: "did:example:issuer",
  setupCompletedAt: "2026-08-03T10:00:00.000Z",
  setupStatus: "COMPLETE",
};

function onlineHealth() {
  return {
    agent: { reachable: true },
    checkedAt: "2026-08-03T10:00:00.000Z",
    ledger: { reachable: true },
  };
}

function offlineHealth() {
  return {
    agent: { reachable: false },
    checkedAt: "2026-08-03T10:00:00.000Z",
    error: "Agent service error: unavailable (status 503)",
    ledger: { reachable: false },
  };
}

function fillProfileForm() {
  fireEvent.change(screen.getByLabelText("University name"), { target: { value: savedProfile.name } });
  fireEvent.change(screen.getByLabelText("Abbreviation"), { target: { value: savedProfile.abbreviation } });
  fireEvent.change(screen.getByLabelText("Contact email"), { target: { value: savedProfile.contactEmail } });
}

describe("SetupWizard", () => {
  beforeEach(() => {
    mocks.checkAgentStatusAction.mockResolvedValue(onlineHealth());
    mocks.createOrGetDidAction.mockResolvedValue({ did: completeProfile.issuerDid, profile: completeProfile });
    mocks.saveProfileAction.mockResolvedValue(savedProfile);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("shows live health states", async () => {
    mocks.checkAgentStatusAction.mockResolvedValueOnce({
      agent: { reachable: true },
      checkedAt: "2026-08-03T10:00:00.000Z",
      ledger: { reachable: false },
    });

    render(<SetupWizard profile={null} />);

    expect(screen.getAllByText("Checking").length).toBeGreaterThan(0);
    expect(await screen.findByText("Online")).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.textContent === "Ledger not reachable")).toBeInTheDocument();
  });

  it("saves a profile and automatically creates the DID when online", async () => {
    render(<SetupWizard profile={null} />);

    await screen.findAllByText("Online");
    fillProfileForm();
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(mocks.saveProfileAction).toHaveBeenCalled());
    await waitFor(() => expect(mocks.createOrGetDidAction).toHaveBeenCalled());
    expect(await screen.findByRole("link", { name: "Configure credential schema" })).toHaveAttribute(
      "href",
      "/credentials/schemas",
    );
    expect(screen.getByText("did:example:issuer")).toBeInTheDocument();
  });

  it("saves the profile while offline and waits without creating a DID", async () => {
    mocks.checkAgentStatusAction.mockResolvedValue(offlineHealth());

    render(<SetupWizard profile={null} />);

    await screen.findAllByText("Offline");
    fillProfileForm();
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Profile saved. Waiting for the agent and ledger to come online.")).toBeInTheDocument();
    expect(mocks.createOrGetDidAction).not.toHaveBeenCalled();
  });

  it("automatically creates the DID after health recovers", async () => {
    mocks.checkAgentStatusAction.mockResolvedValueOnce(offlineHealth()).mockResolvedValue(onlineHealth());

    render(<SetupWizard pollIntervalMs={100} profile={null} />);

    await screen.findAllByText("Offline");
    fillProfileForm();
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findByText("Profile saved. Waiting for the agent and ledger to come online.");

    await waitFor(() => expect(mocks.createOrGetDidAction).toHaveBeenCalled());
    expect(await screen.findByText("University account setup is complete.")).toBeInTheDocument();
  });

  it("shows completion details and schema CTA for an already completed setup", async () => {
    render(<SetupWizard profile={completeProfile} />);

    expect(screen.getByText("University account setup is complete.")).toBeInTheDocument();
    expect(screen.getByText("University of Example")).toBeInTheDocument();
    expect(screen.getByText("did:example:issuer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configure credential schema" })).toHaveAttribute(
      "href",
      "/credentials/schemas",
    );
  });
});
