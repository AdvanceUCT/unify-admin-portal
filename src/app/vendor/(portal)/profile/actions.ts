"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireVendorSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { updateVendorProfile } from "@/lib/vendors/profile";

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

const updateSubVendorProfileSchema = z.object({
  locationName: z.string().trim().min(1, "Location name is required"),
  locationAddress: z.string().trim().max(500).optional(),
  contactPersonName: z.string().trim().min(1, "Contact person name is required"),
  contactEmail: z.string().trim().email("Contact email must be valid"),
});

export type UpdateSubVendorProfileState = {
  status: "idle" | "success" | "error";
  message?: string;
  profile?: {
    locationName: string;
    locationAddress: string;
    contactPersonName: string;
    contactEmail: string;
  };
};

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

export async function updateSubVendorProfileAction(
  _previousState: UpdateSubVendorProfileState,
  formData: FormData,
): Promise<UpdateSubVendorProfileState> {
  const session = await requireVendorSession();

  try {
    const data = updateSubVendorProfileSchema.parse({
      locationName: String(formData.get("locationName") ?? ""),
      locationAddress: String(formData.get("locationAddress") ?? ""),
      contactPersonName: String(formData.get("contactPersonName") ?? ""),
      contactEmail: String(formData.get("contactEmail") ?? ""),
    });

    const currentProfile = await prisma.vendorProfile.findUnique({
      where: { userId: session.user.id },
      select: { parentVendorProfileId: true },
    });

    if (!currentProfile?.parentVendorProfileId) {
      throw new Error("Only sub-vendor accounts can update location details here.");
    }

    const profile = await prisma.vendorProfile.update({
      where: { userId: session.user.id },
      data: {
        locationName: data.locationName,
        locationAddress: data.locationAddress || null,
        contactPersonName: data.contactPersonName,
        contactEmail: data.contactEmail,
      },
    });

    revalidatePath("/vendor/profile");
    revalidatePath("/vendor");

    return {
      status: "success",
      message: "Location profile updated.",
      profile: {
        locationName: profile.locationName ?? "",
        locationAddress: profile.locationAddress ?? "",
        contactPersonName: profile.contactPersonName ?? "",
        contactEmail: profile.contactEmail,
      },
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to update your location profile.",
    };
  }
}
