"use server";

import { revalidatePath } from "next/cache";

import { requireVendorSession } from "@/lib/auth/session";
import { deleteVendorDocument, getDocumentSignedUrl, uploadVendorDocument } from "@/lib/storage/supabase";
import {
  assertDraftDocumentUploadAllowed,
  clearDraftDocumentPath,
  getOrCreateDraftApplication,
  getOwnedDocumentPath,
  saveDraftApplication,
  saveDraftDocumentPath,
  submitDraftApplication,
} from "@/lib/vendors/applications";

export type StepActionResult = { ok: boolean; error?: string };
export type Step1ActionResult = { ok: boolean; applicationId?: string; error?: string };
export type UploadActionResult = { ok: boolean; path?: string; filename?: string; error?: string };
export type ViewUrlActionResult = { ok: boolean; url?: string; error?: string };

const REVALIDATE_PATHS = ["/vendor/application", "/vendor"];

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Step 1: creates or resumes a draft, then saves step 1 data. */
export async function saveStep1Action(formData: FormData): Promise<Step1ActionResult> {
  const session = await requireVendorSession();

  try {
    const draft = await getOrCreateDraftApplication(session.user.id);

    await saveDraftApplication(draft.id, session.user.id, 1, {
      companyName: String(formData.get("companyName") ?? ""),
      companyRegistrationNumber: String(formData.get("companyRegistrationNumber") ?? ""),
      serviceCategory: String(formData.get("serviceCategory") ?? ""),
      website: String(formData.get("website") ?? ""),
      tradingName: String(formData.get("tradingName") ?? ""),
      organisationType: String(formData.get("organisationType") ?? ""),
      physicalAddress: String(formData.get("physicalAddress") ?? ""),
      postalAddress: String(formData.get("postalAddress") ?? ""),
    });

    for (const path of REVALIDATE_PATHS) revalidatePath(path);
    return { ok: true, applicationId: draft.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save step 1." };
  }
}

/** Steps 2, 3, and 5: saves draft data for the given step. */
export async function saveDraftStepAction(formData: FormData): Promise<StepActionResult> {
  const session = await requireVendorSession();
  const applicationId = String(formData.get("applicationId") ?? "");
  const step = Number(formData.get("step")) as 2 | 3 | 5;

  if (!applicationId) return { ok: false, error: "Missing application ID." };
  if (![2, 3, 5].includes(step)) return { ok: false, error: "Invalid step." };

  try {
    const rawData: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (key === "applicationId" || key === "step") continue;

      // requestedScopes comes through as multiple entries with the same key
      if (key === "requestedScopes") {
        const existing = rawData["requestedScopes"];
        rawData["requestedScopes"] = Array.isArray(existing)
          ? [...existing, String(value)]
          : [String(value)];
      } else {
        rawData[key] = String(value);
      }
    }

    // declarationAccepted comes as "on" from a checkbox
    if (step === 5) {
      rawData["declarationAccepted"] = rawData["declarationAccepted"] === "on" ? true : undefined;
    }

    await saveDraftApplication(applicationId, session.user.id, step, rawData);

    for (const path of REVALIDATE_PATHS) revalidatePath(path);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save draft." };
  }
}

/** Step 4: validates, uploads a document, and saves the storage path. */
export async function uploadDocumentAction(formData: FormData): Promise<UploadActionResult> {
  const session = await requireVendorSession();
  const applicationId = String(formData.get("applicationId") ?? "");
  const fieldKey = String(formData.get("fieldKey") ?? "");
  const file = formData.get("file");

  if (!applicationId || !fieldKey) {
    return { ok: false, error: "Missing application ID or field key." };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file was provided. Please choose a file to upload." };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      ok: false,
      error: "That file type isn't accepted. Please upload a PDF, Word, Excel, JPEG, or PNG file.",
    };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: "This file is too large. Please upload a file that's 10 MB or smaller.",
    };
  }

  let uploadedPath: string | undefined;

  try {
    await assertDraftDocumentUploadAllowed(applicationId, session.user.id, fieldKey);
    const { path } = await uploadVendorDocument(file, applicationId, fieldKey);
    uploadedPath = path;
    const { previousPath } = await saveDraftDocumentPath(applicationId, session.user.id, fieldKey, path);

    if (previousPath && previousPath !== path) {
      try {
        await deleteVendorDocument(previousPath);
      } catch (error) {
        console.error(
          `[vendor-documents] Failed to delete replaced file ${previousPath}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    for (const path of REVALIDATE_PATHS) revalidatePath(path);
    return { ok: true, path, filename: file.name };
  } catch {
    if (uploadedPath) {
      try {
        await deleteVendorDocument(uploadedPath);
      } catch (error) {
        console.error(
          `[vendor-documents] Failed to delete orphaned upload ${uploadedPath}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    return {
      ok: false,
      error: "Something went wrong while uploading. Please check the file and try again.",
    };
  }
}

/** Step 4: generates a temporary signed URL so the vendor can view a document they've uploaded. */
export async function getDocumentViewUrlAction(
  applicationId: string,
  fieldKey: string,
): Promise<ViewUrlActionResult> {
  const session = await requireVendorSession();

  try {
    const path = await getOwnedDocumentPath(applicationId, session.user.id, fieldKey);
    if (!path) {
      return { ok: false, error: "No file has been uploaded for this document yet." };
    }

    const url = await getDocumentSignedUrl(path);
    if (!url) {
      return { ok: false, error: "Could not open the file. Please try again." };
    }

    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not open the file. Please try again.",
    };
  }
}

/** Step 4: removes a previously uploaded document from the draft. */
export async function deleteDocumentAction(formData: FormData): Promise<StepActionResult> {
  const session = await requireVendorSession();
  const applicationId = String(formData.get("applicationId") ?? "");
  const fieldKey = String(formData.get("fieldKey") ?? "");

  if (!applicationId || !fieldKey) {
    return { ok: false, error: "Missing application ID or field key." };
  }

  try {
    const { removedPath } = await clearDraftDocumentPath(applicationId, session.user.id, fieldKey);

    if (removedPath) {
      try {
        await deleteVendorDocument(removedPath);
      } catch (error) {
        console.error(
          `[vendor-documents] Failed to delete removed file ${removedPath}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    for (const path of REVALIDATE_PATHS) revalidatePath(path);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not remove the file. Please try again.",
    };
  }
}

/** Final submission: transitions DRAFT → PENDING. */
export async function submitApplicationAction(
  _previousState: StepActionResult,
  formData: FormData,
): Promise<StepActionResult> {
  const session = await requireVendorSession();
  const applicationId = String(formData.get("applicationId") ?? "");

  if (!applicationId) return { ok: false, error: "Missing application ID." };

  try {
    await submitDraftApplication(applicationId, session.user.id);

    for (const path of REVALIDATE_PATHS) revalidatePath(path);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to submit application.",
    };
  }
}
