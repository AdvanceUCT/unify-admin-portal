import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db/prisma";
import {
  addCustomFieldDefinition,
  CustomFieldNotFoundError,
  DuplicateCustomFieldKeyError,
  getActiveCustomFieldDefinitions,
  removeCustomFieldDefinition,
  SystemFieldNameCollisionError,
} from "@/lib/imports/customFields";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    customFieldDefinition: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

const customFieldDefinition = vi.mocked(prisma.customFieldDefinition);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getActiveCustomFieldDefinitions", () => {
  it("lists only active fields for the university, oldest first", async () => {
    customFieldDefinition.findMany.mockResolvedValue([{ key: "cohort" }] as never);

    const result = await getActiveCustomFieldDefinitions("profile-001");

    expect(customFieldDefinition.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "asc" },
      where: { removedAt: null, universityProfileId: "profile-001" },
    });
    expect(result).toEqual([{ key: "cohort" }]);
  });
});

describe("addCustomFieldDefinition", () => {
  it("throws when the key collides with a system field, case-insensitively", async () => {
    await expect(
      addCustomFieldDefinition({ key: "Programme", label: "Programme", universityProfileId: "profile-001" }),
    ).rejects.toBeInstanceOf(SystemFieldNameCollisionError);
    expect(customFieldDefinition.findFirst).not.toHaveBeenCalled();
  });

  it("throws when an active field with the same key (case-insensitive) already exists", async () => {
    customFieldDefinition.findFirst.mockResolvedValueOnce({ id: "existing" } as never);

    await expect(
      addCustomFieldDefinition({ key: "cohort", label: "Cohort", universityProfileId: "profile-001" }),
    ).rejects.toBeInstanceOf(DuplicateCustomFieldKeyError);
  });

  it("reactivates a previously removed field instead of creating a duplicate, preserving its original key casing", async () => {
    customFieldDefinition.findFirst
      .mockResolvedValueOnce(null) // no active match
      .mockResolvedValueOnce({ id: "removed-1", key: "Cohort", removedAt: new Date() } as never); // removed match
    customFieldDefinition.update.mockResolvedValue({ id: "removed-1", key: "Cohort", label: "New label" } as never);

    const result = await addCustomFieldDefinition({
      key: "cohort",
      label: "New label",
      universityProfileId: "profile-001",
    });

    expect(customFieldDefinition.update).toHaveBeenCalledWith({
      data: { label: "New label", removedAt: null },
      where: { id: "removed-1" },
    });
    expect(customFieldDefinition.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ key: "Cohort" });
  });

  it("creates a new field when there is no active or removed match", async () => {
    customFieldDefinition.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    customFieldDefinition.create.mockResolvedValue({ id: "new-1", key: "cohort", label: "Cohort" } as never);

    await addCustomFieldDefinition({ key: "cohort", label: "Cohort", universityProfileId: "profile-001" });

    expect(customFieldDefinition.create).toHaveBeenCalledWith({
      data: { key: "cohort", label: "Cohort", universityProfileId: "profile-001" },
    });
  });

  it("throws when the key or label is blank", async () => {
    await expect(
      addCustomFieldDefinition({ key: "  ", label: "Cohort", universityProfileId: "profile-001" }),
    ).rejects.toThrow(/needs both/);
  });
});

describe("removeCustomFieldDefinition", () => {
  it("soft-deletes an active field by setting removedAt, never touching Student.attributes", async () => {
    customFieldDefinition.updateMany.mockResolvedValue({ count: 1 });

    await removeCustomFieldDefinition({ key: "cohort", universityProfileId: "profile-001" });

    expect(customFieldDefinition.updateMany).toHaveBeenCalledWith({
      data: { removedAt: expect.any(Date) },
      where: { key: "cohort", removedAt: null, universityProfileId: "profile-001" },
    });
  });

  it("throws CustomFieldNotFoundError when no active field matches", async () => {
    customFieldDefinition.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      removeCustomFieldDefinition({ key: "missing", universityProfileId: "profile-001" }),
    ).rejects.toBeInstanceOf(CustomFieldNotFoundError);
  });
});
