import { beforeEach, describe, expect, it, vi } from "vitest";

import { uploadDocumentAction } from "@/app/vendor/(portal)/application/actions";
import { requireVendorSession } from "@/lib/auth/session";
import { deleteVendorDocument, uploadVendorDocument } from "@/lib/storage/supabase";
import {
  assertDraftDocumentUploadAllowed,
  saveDraftDocumentPath,
} from "@/lib/vendors/applications";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireVendorSession: vi.fn(),
}));

vi.mock("@/lib/storage/supabase", () => ({
  deleteVendorDocument: vi.fn(),
  uploadVendorDocument: vi.fn(),
}));

vi.mock("@/lib/vendors/applications", () => ({
  assertDraftDocumentUploadAllowed: vi.fn(),
  clearDraftDocumentPath: vi.fn(),
  getOrCreateDraftApplication: vi.fn(),
  saveDraftApplication: vi.fn(),
  saveDraftDocumentPath: vi.fn(),
  submitDraftApplication: vi.fn(),
}));

const requireVendorSessionMock = vi.mocked(requireVendorSession);
const assertDraftDocumentUploadAllowedMock = vi.mocked(assertDraftDocumentUploadAllowed);
const uploadVendorDocumentMock = vi.mocked(uploadVendorDocument);
const saveDraftDocumentPathMock = vi.mocked(saveDraftDocumentPath);
const deleteVendorDocumentMock = vi.mocked(deleteVendorDocument);

function uploadFormData() {
  const formData = new FormData();
  formData.set("applicationId", "app_1");
  formData.set("fieldKey", "docProofOfAddress");
  formData.set("file", new File(["document"], "proof.pdf", { type: "application/pdf" }));
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireVendorSessionMock.mockResolvedValue({ user: { id: "vendor_user_1" } } as never);
  assertDraftDocumentUploadAllowedMock.mockResolvedValue(undefined);
  uploadVendorDocumentMock.mockResolvedValue({ path: "app_1/docProofOfAddress/proof.pdf" });
  saveDraftDocumentPathMock.mockResolvedValue({ previousPath: null });
});

describe("uploadDocumentAction", () => {
  it("validates draft ownership before uploading to storage", async () => {
    assertDraftDocumentUploadAllowedMock.mockRejectedValueOnce(new Error("Draft application not found."));

    const result = await uploadDocumentAction(uploadFormData());

    expect(result).toEqual({
      ok: false,
      error: "Something went wrong while uploading. Please check the file and try again.",
    });
    expect(assertDraftDocumentUploadAllowedMock).toHaveBeenCalledWith(
      "app_1",
      "vendor_user_1",
      "docProofOfAddress",
    );
    expect(uploadVendorDocumentMock).not.toHaveBeenCalled();
  });

  it("deletes the new storage object if saving the document path fails", async () => {
    saveDraftDocumentPathMock.mockRejectedValueOnce(new Error("Database unavailable."));

    const result = await uploadDocumentAction(uploadFormData());

    expect(result.ok).toBe(false);
    expect(uploadVendorDocumentMock).toHaveBeenCalledWith(
      expect.any(File),
      "app_1",
      "docProofOfAddress",
    );
    expect(deleteVendorDocumentMock).toHaveBeenCalledWith("app_1/docProofOfAddress/proof.pdf");
  });

  it("deletes the replaced document only after the new path is saved", async () => {
    saveDraftDocumentPathMock.mockResolvedValueOnce({ previousPath: "app_1/docProofOfAddress/old.pdf" });

    const result = await uploadDocumentAction(uploadFormData());

    expect(result.ok).toBe(true);
    expect(deleteVendorDocumentMock).toHaveBeenCalledWith("app_1/docProofOfAddress/old.pdf");
  });
});
