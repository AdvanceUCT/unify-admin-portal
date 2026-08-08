import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateUniversityProfileAction } from "@/app/(admin)/settings/actions";
import { AuditAction } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { requireRole } from "@/lib/auth/session";
import { getUniversityProfile, updateUniversityProfile } from "@/lib/university/profile";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/agentClient", () => ({ checkAgentHealth: vi.fn() }));
vi.mock("@/lib/audit/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/university/profile", () => ({
  getUniversityProfile: vi.fn(),
  updateUniversityProfile: vi.fn(),
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
