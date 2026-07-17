"use server";

import { revalidatePath } from "next/cache";

import { requireVendorSession } from "@/lib/auth/session";
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
