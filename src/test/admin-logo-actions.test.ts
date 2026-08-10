import { beforeEach, describe, expect, it, vi } from "vitest";

import { removeUniversityLogoAction, uploadUniversityLogoAction } from "@/app/(admin)/settings/actions";
import { requireRole } from "@/lib/auth/session";
import { deleteVendorDocument, uploadUniversityLogo } from "@/lib/storage/supabase";
import {
  getUniversityProfile,
  removeUniversityProfileLogo,
  saveUniversityProfileLogoPath,
} from "@/lib/university/profile";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/agentClient", () => ({
  checkAgentHealth: vi.fn(),
}));

vi.mock("@/lib/audit/audit", () => ({
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

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

const requireRoleMock = vi.mocked(requireRole);
const getUniversityProfileMock = vi.mocked(getUniversityProfile);
const uploadUniversityLogoMock = vi.mocked(uploadUniversityLogo);
const saveUniversityProfileLogoPathMock = vi.mocked(saveUniversityProfileLogoPath);
const deleteVendorDocumentMock = vi.mocked(deleteVendorDocument);
const removeUniversityProfileLogoMock = vi.mocked(removeUniversityProfileLogo);

function uploadFormData(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  return formData;
}

function fileWithBytes(bytes: Uint8Array, name: string, type: string) {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const file = new File([arrayBuffer], name, { type });
  Object.defineProperty(file, "slice", {
    value: () => ({ arrayBuffer: async () => arrayBuffer }),
  });
  return file;
}

function pngFile(name = "logo.png") {
  return fileWithBytes(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    name,
    "image/png",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue({ user: { id: "admin_1" } } as never);
  getUniversityProfileMock.mockResolvedValue({ id: "university_1" } as never);
  uploadUniversityLogoMock.mockResolvedValue({
    path: "university-logos/university_1/logo.png",
  });
  saveUniversityProfileLogoPathMock.mockResolvedValue({ previousPath: null });
});

describe("uploadUniversityLogoAction", () => {
  it("rejects files that are not an accepted image type", async () => {
    const file = new File(["logo"], "logo.pdf", { type: "application/pdf" });

    const result = await uploadUniversityLogoAction(uploadFormData(file));

    expect(result).toEqual({
      ok: false,
      error: "That file is not a valid PNG, JPEG, or WEBP image.",
    });
    expect(uploadUniversityLogoMock).not.toHaveBeenCalled();
  });

  it("rejects logo changes when no university profile exists", async () => {
    getUniversityProfileMock.mockResolvedValueOnce(null);

    const result = await uploadUniversityLogoAction(uploadFormData(pngFile()));

    expect(result).toEqual({
      ok: false,
      error: "No university profile exists yet. Complete setup first.",
    });
    expect(uploadUniversityLogoMock).not.toHaveBeenCalled();
  });

  it("uploads the logo and deletes the previous one once the new path is saved", async () => {
    saveUniversityProfileLogoPathMock.mockResolvedValueOnce({
      previousPath: "university-logos/university_1/old.png",
    });

    const result = await uploadUniversityLogoAction(uploadFormData(pngFile()));

    expect(result).toEqual({ ok: true });
    expect(uploadUniversityLogoMock).toHaveBeenCalledWith(expect.any(File), "university_1");
    expect(saveUniversityProfileLogoPathMock).toHaveBeenCalledWith(
      "university_1",
      "admin_1",
      "university-logos/university_1/logo.png",
    );
    expect(deleteVendorDocumentMock).toHaveBeenCalledWith(
      "university-logos/university_1/old.png",
    );
  });

  it("deletes the new upload if saving the path fails", async () => {
    saveUniversityProfileLogoPathMock.mockRejectedValueOnce(new Error("Database unavailable."));

    const result = await uploadUniversityLogoAction(uploadFormData(pngFile()));

    expect(result.ok).toBe(false);
    expect(deleteVendorDocumentMock).toHaveBeenCalledWith(
      "university-logos/university_1/logo.png",
    );
  });
});

describe("removeUniversityLogoAction", () => {
  it("removes the stored logo from the profile and storage", async () => {
    removeUniversityProfileLogoMock.mockResolvedValueOnce({
      removedPath: "university-logos/university_1/logo.png",
    });

    const result = await removeUniversityLogoAction();

    expect(result).toEqual({ ok: true });
    expect(removeUniversityProfileLogoMock).toHaveBeenCalledWith("university_1", "admin_1");
    expect(deleteVendorDocumentMock).toHaveBeenCalledWith(
      "university-logos/university_1/logo.png",
    );
  });

  it("does not attempt storage deletion when there was no logo", async () => {
    removeUniversityProfileLogoMock.mockResolvedValueOnce({ removedPath: null });

    const result = await removeUniversityLogoAction();

    expect(result).toEqual({ ok: true });
    expect(deleteVendorDocumentMock).not.toHaveBeenCalled();
  });
});
