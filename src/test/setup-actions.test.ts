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
    deleteVendorDocument: vi.fn(),
    getDocumentSignedUrl: vi.fn(),
    getIssuerDid: vi.fn(),
    getStatus: vi.fn(),
    getUniversityProfile: vi.fn(),
    requireRole: vi.fn(),
    revalidatePath: vi.fn(),
    saveUniversityProfileLogoPath: vi.fn(),
    transactionUniversityProfileCreate: vi.fn(),
    transactionUniversityProfileFindFirst: vi.fn(),
    transactionUniversityProfileUpdate: vi.fn(),
    transactionWalletAccountUpsert: vi.fn(),
    universityProfileUpdate: vi.fn(),
    uploadUniversityLogo: vi.fn(),
    validateLogoFile: vi.fn(),
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

vi.mock("@/lib/auth/session", () => ({
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/images/logoValidation", () => ({
  validateLogoFile: mocks.validateLogoFile,
}));

vi.mock("@/lib/storage/supabase", () => ({
  deleteVendorDocument: mocks.deleteVendorDocument,
  getDocumentSignedUrl: mocks.getDocumentSignedUrl,
  uploadUniversityLogo: mocks.uploadUniversityLogo,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn((operation: (client: unknown) => unknown) =>
      operation({
        universityProfile: {
          create: mocks.transactionUniversityProfileCreate,
          findFirst: mocks.transactionUniversityProfileFindFirst,
          update: mocks.transactionUniversityProfileUpdate,
        },
        walletAccount: {
          upsert: mocks.transactionWalletAccountUpsert,
        },
      }),
    ),
    universityProfile: {
      update: mocks.universityProfileUpdate,
    },
  },
}));

vi.mock("@/lib/university/profile", () => ({
  getUniversityProfile: mocks.getUniversityProfile,
  saveUniversityProfileLogoPath: mocks.saveUniversityProfileLogoPath,
}));

import { checkAgentStatusAction, createOrGetDidAction, saveProfileAction } from "@/app/(auth)/setup/actions";

const profile = {
  abbreviation: "UEX",
  contactEmail: "admin@example.edu",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  defaultCredentialValidityDays: 365,
  id: "profile-1",
  issuerDid: null,
  logoPath: null,
  name: "University of Example",
  paymentWalletEnabled: false,
  paymentWalletRefundWindowSeconds: 600,
  paymentWalletSettlementDelaySeconds: 600,
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
  return formData;
}

describe("setup actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ user: { id: "actor-1" } });
    mocks.transactionUniversityProfileFindFirst.mockResolvedValue(null);
    mocks.transactionUniversityProfileCreate.mockResolvedValue(profile);
    mocks.transactionUniversityProfileUpdate.mockResolvedValue(profile);
    mocks.transactionWalletAccountUpsert.mockImplementation(async ({ create }) => ({
      ...create,
      id: `account-${create.systemCode}`,
      status: "ACTIVE",
      balance: {
        postedBalanceMinor: BigInt(0),
        version: BigInt(0),
      },
    }));
    mocks.universityProfileUpdate.mockResolvedValue(completedProfile());
  });

  it("saves and returns a serialized university profile", async () => {
    const result = await saveProfileAction(profileFormData());

    expect(mocks.transactionUniversityProfileCreate).toHaveBeenCalledWith({
      data: {
        abbreviation: "UEX",
        contactEmail: "admin@example.edu",
        name: "University of Example",
        paymentWalletEnabled: false,
      },
    });
    expect(mocks.transactionWalletAccountUpsert).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: "profile-1",
        issuerDid: null,
        paymentWalletEnabled: false,
        setupCompletedAt: null,
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/setup");
  });

  it("enables the payment wallet during setup and provisions clearing accounts", async () => {
    mocks.transactionUniversityProfileCreate.mockResolvedValue({
      ...profile,
      paymentWalletEnabled: true,
    });
    const formData = profileFormData();
    formData.set("paymentWalletEnabled", "on");

    const result = await saveProfileAction(formData);

    expect(mocks.transactionUniversityProfileCreate).toHaveBeenCalledWith({
      data: {
        abbreviation: "UEX",
        contactEmail: "admin@example.edu",
        name: "University of Example",
        paymentWalletEnabled: true,
      },
    });
    expect(mocks.transactionWalletAccountUpsert).toHaveBeenCalledTimes(2);
    expect(result.paymentWalletEnabled).toBe(true);
  });

  it("can save an existing setup profile with the payment wallet disabled", async () => {
    mocks.transactionUniversityProfileFindFirst.mockResolvedValue({
      id: "profile-1",
    });

    await saveProfileAction(profileFormData());

    expect(mocks.transactionUniversityProfileUpdate).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: {
        abbreviation: "UEX",
        contactEmail: "admin@example.edu",
        name: "University of Example",
        paymentWalletEnabled: false,
      },
    });
    expect(mocks.transactionWalletAccountUpsert).not.toHaveBeenCalled();
  });

  it("uploads a logo included in the same submission and records its path", async () => {
    mocks.validateLogoFile.mockResolvedValue({ ok: true });
    mocks.uploadUniversityLogo.mockResolvedValue({ path: "university-logos/profile-1/logo.png" });
    mocks.saveUniversityProfileLogoPath.mockResolvedValue({ previousPath: null });
    mocks.getDocumentSignedUrl.mockResolvedValue("https://storage.example/signed-logo.png");

    const formData = profileFormData();
    const file = new File(["fake-image-bytes"], "logo.png", { type: "image/png" });
    formData.append("file", file);

    const result = await saveProfileAction(formData);

    expect(mocks.validateLogoFile).toHaveBeenCalledWith(file);
    expect(mocks.uploadUniversityLogo).toHaveBeenCalledWith(file, "profile-1");
    expect(mocks.saveUniversityProfileLogoPath).toHaveBeenCalledWith(
      "profile-1",
      "actor-1",
      "university-logos/profile-1/logo.png",
    );
    expect(result.logoUrl).toBe("https://storage.example/signed-logo.png");
  });

  it("saves the profile but surfaces an error when the logo fails validation", async () => {
    mocks.validateLogoFile.mockResolvedValue({ ok: false, error: "That file is not a valid PNG, JPEG, or WEBP image." });

    const formData = profileFormData();
    formData.append("file", new File(["not-an-image"], "logo.txt", { type: "text/plain" }));

    await expect(saveProfileAction(formData)).rejects.toThrow(
      "That file is not a valid PNG, JPEG, or WEBP image.",
    );
    expect(mocks.uploadUniversityLogo).not.toHaveBeenCalled();
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
