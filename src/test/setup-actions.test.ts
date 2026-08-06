import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class AgentServiceError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly details?: unknown,
    ) {
      super(message);
      this.name = "AgentServiceError";
    }
  }

  return {
    AgentServiceError,
    createIssuerDid: vi.fn(),
    getIssuerDid: vi.fn(),
    getStatus: vi.fn(),
    getUniversityProfile: vi.fn(),
    revalidatePath: vi.fn(),
    universityProfileUpdate: vi.fn(),
    upsertUniversityProfile: vi.fn(),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/agentClient", () => ({
  AgentServiceError: mocks.AgentServiceError,
  createIssuerDid: mocks.createIssuerDid,
  getIssuerDid: mocks.getIssuerDid,
  getStatus: mocks.getStatus,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    universityProfile: {
      update: mocks.universityProfileUpdate,
    },
  },
}));

vi.mock("@/lib/university/profile", () => ({
  getUniversityProfile: mocks.getUniversityProfile,
  upsertUniversityProfile: mocks.upsertUniversityProfile,
}));

import { checkAgentStatusAction, createOrGetDidAction, saveProfileAction } from "@/app/(auth)/setup/actions";

const profile = {
  abbreviation: "UEX",
  contactEmail: "admin@example.edu",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  defaultCredentialValidityDays: 365,
  id: "profile-1",
  issuerDid: null,
  logoUrl: null,
  name: "University of Example",
  renewalCadenceMonths: 12,
  setupCompletedAt: null,
  setupStatus: "PENDING",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function completedProfile(did = "did:example:issuer") {
  return {
    ...profile,
    issuerDid: did,
    setupCompletedAt: new Date("2026-08-03T10:00:00.000Z"),
    setupStatus: "COMPLETE",
  };
}

function profileFormData() {
  const formData = new FormData();
  formData.append("name", profile.name);
  formData.append("abbreviation", profile.abbreviation);
  formData.append("contactEmail", profile.contactEmail);
  formData.append("logoUrl", "");
  return formData;
}

describe("setup actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsertUniversityProfile.mockResolvedValue(profile);
    mocks.universityProfileUpdate.mockResolvedValue(completedProfile());
  });

  it("saves and returns a serialized university profile", async () => {
    const result = await saveProfileAction(profileFormData());

    expect(mocks.upsertUniversityProfile).toHaveBeenCalledWith({
      abbreviation: "UEX",
      contactEmail: "admin@example.edu",
      logoUrl: null,
      name: "University of Example",
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "profile-1",
        issuerDid: null,
        setupCompletedAt: null,
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/setup");
  });

  it("marks setup complete when an issuer DID already exists on the profile", async () => {
    mocks.getUniversityProfile.mockResolvedValue(completedProfile("did:example:stored"));
    mocks.universityProfileUpdate.mockResolvedValue(completedProfile("did:example:stored"));

    const result = await createOrGetDidAction();

    expect(mocks.getIssuerDid).not.toHaveBeenCalled();
    expect(mocks.universityProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issuerDid: "did:example:stored",
          setupStatus: "COMPLETE",
        }),
      }),
    );
    expect(result.did).toBe("did:example:stored");
    expect(result.profile.setupStatus).toBe("COMPLETE");
  });

  it("gets an existing agent DID and marks setup complete", async () => {
    mocks.getUniversityProfile.mockResolvedValue(profile);
    mocks.getIssuerDid.mockResolvedValue({ did: "did:example:agent" });
    mocks.universityProfileUpdate.mockResolvedValue(completedProfile("did:example:agent"));

    const result = await createOrGetDidAction();

    expect(mocks.createIssuerDid).not.toHaveBeenCalled();
    expect(mocks.universityProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issuerDid: "did:example:agent",
          setupCompletedAt: expect.any(Date),
          setupStatus: "COMPLETE",
        }),
      }),
    );
    expect(result.did).toBe("did:example:agent");
  });

  it("creates a DID when the agent has none yet and marks setup complete", async () => {
    mocks.getUniversityProfile.mockResolvedValue(profile);
    mocks.getIssuerDid.mockRejectedValue(new mocks.AgentServiceError("Not found", 404));
    mocks.createIssuerDid.mockResolvedValue({ did: "did:example:new" });
    mocks.universityProfileUpdate.mockResolvedValue(completedProfile("did:example:new"));

    const result = await createOrGetDidAction();

    expect(mocks.createIssuerDid).toHaveBeenCalledWith("University of Example");
    expect(result.did).toBe("did:example:new");
    expect(result.profile.setupStatus).toBe("COMPLETE");
  });

  it("uses a DID returned by a create conflict and marks setup complete", async () => {
    mocks.getUniversityProfile.mockResolvedValue(profile);
    mocks.getIssuerDid.mockRejectedValue(new mocks.AgentServiceError("Not found", 404));
    mocks.createIssuerDid.mockRejectedValue(new mocks.AgentServiceError("Already exists", 409, { did: "did:example:race" }));
    mocks.universityProfileUpdate.mockResolvedValue(completedProfile("did:example:race"));

    const result = await createOrGetDidAction();

    expect(result.did).toBe("did:example:race");
    expect(mocks.universityProfileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ issuerDid: "did:example:race", setupStatus: "COMPLETE" }),
      }),
    );
  });

  it("returns offline health details without throwing", async () => {
    mocks.getStatus.mockRejectedValue(new mocks.AgentServiceError("Service unavailable", 503));

    const result = await checkAgentStatusAction();

    expect(result.agent.reachable).toBe(false);
    expect(result.ledger.reachable).toBe(false);
    expect(result.error).toContain("Service unavailable");
  });

  it("returns offline health details when the health check times out", async () => {
    mocks.getStatus.mockRejectedValue(
      new mocks.AgentServiceError("Agent service request timed out after 5000ms.", 504, {
        code: "AGENT_SERVICE_TIMEOUT",
        path: "/api/status",
        timeoutMs: 5_000,
      }),
    );

    const result = await checkAgentStatusAction();

    expect(result.agent).toEqual({ reachable: false });
    expect(result.ledger).toEqual({ reachable: false });
    expect(result.error).toContain("Agent service request timed out after 5000ms.");
  });

  it("does not mark setup complete when DID creation times out", async () => {
    mocks.getUniversityProfile.mockResolvedValue(profile);
    mocks.getIssuerDid.mockRejectedValue(
      new mocks.AgentServiceError("Agent service request timed out after 15000ms.", 504, {
        code: "AGENT_SERVICE_TIMEOUT",
        path: "/api/dids/issuer",
        timeoutMs: 15_000,
      }),
    );

    await expect(createOrGetDidAction()).rejects.toMatchObject({
      message: "Agent service request timed out after 15000ms.",
      status: 504,
    });
    expect(mocks.universityProfileUpdate).not.toHaveBeenCalled();
  });
});
