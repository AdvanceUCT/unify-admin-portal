/**
 * @fileoverview Contains the server actions used by the `/vendor/profile` workflow.
 * @module app/vendor/(portal)/profile/actions
 */

"use server";

import { revalidatePath } from "next/cache";

import { requireVendorSession } from "@/lib/auth/session";
import { validateLogoFile } from "@/lib/images/logoValidation";
import { deleteVendorDocument, uploadVendorLogo } from "@/lib/storage/supabase";
import {
  getVendorProfileForUser,
  removeVendorProfileLogo,
  saveVendorProfileLogoPath,
  updateVendorProfile,
} from "@/lib/vendors/profile";

export type UpdateProfileState = {
  status: "idle" | "success" | "error";
  message?: string;
  profile?: {
    companyName: string;
    serviceCategory: string;
    contactPersonName: string;
    contactEmail: string;
  };
};

export type LogoActionResult = { ok: boolean; error?: string };

const REVALIDATE_PATHS = ["/vendor/profile", "/vendor"];

export async function updateVendorProfileAction(
  _previousState: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const session = await requireVendorSession();

  try {
    const profile = await updateVendorProfile({
      userId: session.user.id,
      input: {
        companyName: String(formData.get("companyName") ?? ""),
        serviceCategory: String(formData.get("serviceCategory") ?? ""),
        contactPersonName: String(formData.get("contactPersonName") ?? ""),
        contactEmail: String(formData.get("contactEmail") ?? ""),
      },
    });

    revalidatePath("/vendor/profile");

    return {
      status: "success",
      message: "Profile updated.",
      profile: {
        companyName: profile.companyName,
        serviceCategory: profile.serviceCategory,
        contactPersonName: profile.contactPersonName ?? "",
        contactEmail: profile.contactEmail,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to update your profile.",
    };
  }
}

export async function uploadLogoAction(formData: FormData): Promise<LogoActionResult> {
  const session = await requireVendorSession();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file was provided. Please choose an image to upload." };
  }
  const validation = await validateLogoFile(file);
  if (!validation.ok) return validation;

  const profile = await getVendorProfileForUser(session.user.id);
  if (!profile) {
    return { ok: false, error: "Only the vendor owner can update the organisation logo." };
  }

  let uploadedPath: string | undefined;
  try {
    const { path } = await uploadVendorLogo(file, profile.id);
    uploadedPath = path;
    const { previousPath } = await saveVendorProfileLogoPath(session.user.id, path);

    if (previousPath && previousPath !== path) {
      try {
        await deleteVendorDocument(previousPath);
      } catch (error) {
        console.error(
          `[vendor-logo] Failed to delete replaced logo ${previousPath}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    for (const pathToRevalidate of REVALIDATE_PATHS) revalidatePath(pathToRevalidate);
    return { ok: true };
  } catch {
    if (uploadedPath) {
      try {
        await deleteVendorDocument(uploadedPath);
      } catch (error) {
        console.error(
          `[vendor-logo] Failed to delete orphaned upload ${uploadedPath}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    return { ok: false, error: "Something went wrong while uploading. Please try again." };
  }
}

export async function removeLogoAction(): Promise<LogoActionResult> {
  const session = await requireVendorSession();

  try {
    const { removedPath } = await removeVendorProfileLogo(session.user.id);
    if (removedPath) {
      try {
        await deleteVendorDocument(removedPath);
      } catch (error) {
        console.error(
          `[vendor-logo] Failed to delete removed logo ${removedPath}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    for (const pathToRevalidate of REVALIDATE_PATHS) revalidatePath(pathToRevalidate);
    return { ok: true };
  } catch {
    return { ok: false, error: "Only the vendor owner can remove the organisation logo." };
  }
}
