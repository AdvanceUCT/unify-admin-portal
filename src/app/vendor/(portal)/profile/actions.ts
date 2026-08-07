"use server";

import { revalidatePath } from "next/cache";

import { requireVendorSession } from "@/lib/auth/session";
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

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const REVALIDATE_PATHS = ["/vendor/profile", "/vendor"];

async function hasExpectedImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  }
  if (file.type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.type === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

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
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "This file is too large. Please upload an image that's 2 MB or smaller." };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type) || !(await hasExpectedImageSignature(file))) {
    return { ok: false, error: "That file is not a valid PNG, JPEG, or WEBP image." };
  }

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
