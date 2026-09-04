import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveRenewalSettingsAction, updateUniversityProfileAction } from "@/app/(admin)/settings/actions";
import { AuditAction } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { requireRole } from "@/lib/auth/session";
import { getUniversityProfile, updateUniversityProfile } from "@/lib/university/profile";

const transactionClientMocks = vi.hoisted(() => ({
  auditLogCreate: vi.fn(),
  universityProfileUpdate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/agentClient", () => ({ checkAgentHealth: vi.fn() }));
vi.mock("@/lib/billing/invoiceService", () => ({ setVerificationRateCents: vi.fn() }));
vi.mock("@/lib/audit/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/storage/supabase", () => ({
  deleteVendorDocument: vi.fn(),
  uploadUniversityLogo: vi.fn(),
}));
vi.mock("@/lib/university/profile", () => ({
  getUniversityProfile: vi.fn(),
  removeUniversityProfileLogo: vi.fn(),
  saveUniversityProfileLogoPath: vi.fn(),
  updateUniversityProfile: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn((operation: (client: unknown) => unknown) =>
      operation({
        auditLog: { create: transactionClientMocks.auditLogCreate },
        universityProfile: { update: transactionClientMocks.universityProfileUpdate },
      }),
    ),
  },
}));

const requireRoleMock = vi.mocked(requireRole);
const getUniversityProfileMock = vi.mocked(getUniversityProfile);
const updateUniversityProfileMock = vi.mocked(updateUniversityProfile);
const writeAuditLogMock = vi.mocked(writeAuditLog);

function settingsForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  const values = {
    name: "University of Example",
    abbreviation: "UOE",
    contactEmail: "admin@example.edu",
    websiteUrl: "https://example.edu",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue({ user: { id: "admin_1" } } as never);
  getUniversityProfileMock.mockResolvedValue({ id: "university_1" } as never);
  updateUniversityProfileMock.mockResolvedValue({ id: "university_1" } as never);
});

describe("updateUniversityProfileAction", () => {
  it("returns a useful validation error without updating", async () => {
    const result = await updateUniversityProfileAction(
      { status: "idle" },
      settingsForm({ contactEmail: "not-an-email" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Enter a valid contact email address.",
    });
    expect(updateUniversityProfileMock).not.toHaveBeenCalled();
  });

  it("rejects non-HTTP website URLs", async () => {
    const result = await updateUniversityProfileAction(
      { status: "idle" },
      settingsForm({ websiteUrl: "javascript:alert(1)" }),
    );

    expect(result.status).toBe("error");
    expect(updateUniversityProfileMock).not.toHaveBeenCalled();
  });

  it("updates the profile and writes an audit event", async () => {
    const result = await updateUniversityProfileAction(
      { status: "idle" },
      settingsForm(),
    );

    expect(result).toEqual({
      status: "success",
      message: "University profile updated.",
    });
    expect(updateUniversityProfileMock).toHaveBeenCalledWith("university_1", {
      name: "University of Example",
      abbreviation: "UOE",
      contactEmail: "admin@example.edu",
      websiteUrl: "https://example.edu",
    });
    expect(writeAuditLogMock).toHaveBeenCalledWith({
      action: AuditAction.SETTINGS_UPDATED,
      actorId: "admin_1",
      targetType: "UniversityProfile",
      targetId: "university_1",
      meta: { section: "university_profile" },
    });
  });
});

function renewalForm(overrides: Record<string, string> = {}) {
  const formData = new FormData();
  const values = {
    defaultCredentialValidityDays: "365",
    renewalCadenceMonths: "12",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

describe("saveRenewalSettingsAction", () => {
  it("rejects invalid input without writing anything", async () => {
    await expect(
      saveRenewalSettingsAction(renewalForm({ defaultCredentialValidityDays: "0" })),
    ).rejects.toThrow("Validity days and renewal cadence must be valid positive numbers.");

    expect(transactionClientMocks.universityProfileUpdate).not.toHaveBeenCalled();
    expect(transactionClientMocks.auditLogCreate).not.toHaveBeenCalled();
  });

  it("updates validity/renewal settings and writes an audit event", async () => {
    await saveRenewalSettingsAction(
      renewalForm({ defaultCredentialValidityDays: "400", renewalCadenceMonths: "6" }),
    );

    expect(transactionClientMocks.universityProfileUpdate).toHaveBeenCalledWith({
      data: { defaultCredentialValidityDays: 400, renewalCadenceMonths: 6 },
      where: { id: "university_1" },
    });
    expect(transactionClientMocks.auditLogCreate).toHaveBeenCalledWith({
      data: {
        action: AuditAction.RENEWAL_SETTINGS_UPDATED,
        actorId: "admin_1",
        meta: { defaultCredentialValidityDays: 400, renewalCadenceMonths: 6 },
        targetId: "university_1",
        targetType: "UniversityProfile",
      },
    });
  });
});
