import { beforeEach, describe, expect, it, vi } from "vitest";

import { removeLogoAction, uploadLogoAction } from "@/app/vendor/(portal)/profile/actions";
import { requireVendorSession } from "@/lib/auth/session";
import { deleteVendorDocument, uploadVendorLogo } from "@/lib/storage/supabase";
import {
  getVendorProfileForUser,
  removeVendorProfileLogo,
  saveVendorProfileLogoPath,
} from "@/lib/vendors/profile";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireVendorSession: vi.fn(),
}));

vi.mock("@/lib/storage/supabase", () => ({
  deleteVendorDocument: vi.fn(),
  uploadVendorLogo: vi.fn(),
}));

vi.mock("@/lib/vendors/profile", () => ({
  getVendorProfileForUser: vi.fn(),
  removeVendorProfileLogo: vi.fn(),
  saveVendorProfileLogoPath: vi.fn(),
}));

const requireVendorSessionMock = vi.mocked(requireVendorSession);
const getVendorProfileForUserMock = vi.mocked(getVendorProfileForUser);
const uploadVendorLogoMock = vi.mocked(uploadVendorLogo);
const saveVendorProfileLogoPathMock = vi.mocked(saveVendorProfileLogoPath);
const deleteVendorDocumentMock = vi.mocked(deleteVendorDocument);
const removeVendorProfileLogoMock = vi.mocked(removeVendorProfileLogo);

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
  requireVendorSessionMock.mockResolvedValue({ user: { id: "vendor_user_1" } } as never);
  getVendorProfileForUserMock.mockResolvedValue({ id: "profile_1" } as never);
  uploadVendorLogoMock.mockResolvedValue({ path: "logos/profile_1/logo.png" });
  saveVendorProfileLogoPathMock.mockResolvedValue({ previousPath: null });
});

describe("uploadLogoAction", () => {
  it("rejects files that are not an accepted image type", async () => {
    const file = new File(["logo"], "logo.pdf", { type: "application/pdf" });

    const result = await uploadLogoAction(uploadFormData(file));

    expect(result).toEqual({
      ok: false,
      error: "That file is not a valid PNG, JPEG, or WEBP image.",
    });
    expect(uploadVendorLogoMock).not.toHaveBeenCalled();
  });

  it("rejects a file whose contents do not match its image MIME type", async () => {
    const file = fileWithBytes(
      new TextEncoder().encode("not an image"),
      "logo.png",
      "image/png",
    );

    const result = await uploadLogoAction(uploadFormData(file));

    expect(result).toEqual({
      ok: false,
      error: "That file is not a valid PNG, JPEG, or WEBP image.",
    });
    expect(uploadVendorLogoMock).not.toHaveBeenCalled();
  });

  it("rejects logo changes from accounts that do not own a vendor profile", async () => {
    getVendorProfileForUserMock.mockResolvedValueOnce(null);

    const result = await uploadLogoAction(uploadFormData(pngFile()));

    expect(result).toEqual({
      ok: false,
      error: "Only the vendor owner can update the organisation logo.",
    });
    expect(uploadVendorLogoMock).not.toHaveBeenCalled();
  });

  it("rejects files larger than 2 MB", async () => {
    const oversized = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "logo.png", {
      type: "image/png",
    });

    const result = await uploadLogoAction(uploadFormData(oversized));

    expect(result).toEqual({
      ok: false,
      error: "This file is too large. Please upload an image that's 2 MB or smaller.",
    });
    expect(uploadVendorLogoMock).not.toHaveBeenCalled();
  });

  it("uploads the logo and deletes the previous one once the new path is saved", async () => {
    saveVendorProfileLogoPathMock.mockResolvedValueOnce({
      previousPath: "logos/profile_1/old.png",
    });
    const file = pngFile();

    const result = await uploadLogoAction(uploadFormData(file));

    expect(result).toEqual({ ok: true });
    expect(uploadVendorLogoMock).toHaveBeenCalledWith(expect.any(File), "profile_1");
    expect(saveVendorProfileLogoPathMock).toHaveBeenCalledWith(
      "vendor_user_1",
      "logos/profile_1/logo.png",
    );
    expect(deleteVendorDocumentMock).toHaveBeenCalledWith("logos/profile_1/old.png");
  });

  it("deletes the new upload if saving the path fails", async () => {
    saveVendorProfileLogoPathMock.mockRejectedValueOnce(new Error("Database unavailable."));
    const file = pngFile();

    const result = await uploadLogoAction(uploadFormData(file));

    expect(result.ok).toBe(false);
    expect(deleteVendorDocumentMock).toHaveBeenCalledWith("logos/profile_1/logo.png");
  });
});

describe("removeLogoAction", () => {
  it("removes the stored logo from the profile and storage", async () => {
    removeVendorProfileLogoMock.mockResolvedValueOnce({
      removedPath: "logos/profile_1/logo.png",
    });

    const result = await removeLogoAction();

    expect(result).toEqual({ ok: true });
    expect(deleteVendorDocumentMock).toHaveBeenCalledWith("logos/profile_1/logo.png");
  });

  it("does not attempt storage deletion when there was no logo", async () => {
    removeVendorProfileLogoMock.mockResolvedValueOnce({ removedPath: null });

    const result = await removeLogoAction();

    expect(result).toEqual({ ok: true });
    expect(deleteVendorDocumentMock).not.toHaveBeenCalled();
  });
});
