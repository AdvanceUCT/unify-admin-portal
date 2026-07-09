"use server";

import { revalidatePath } from "next/cache";

import { requireVendorSession } from "@/lib/auth/session";
import { createVendorApplication } from "@/lib/vendors/applications";

export type SubmitApplicationState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function submitApplicationAction(
  _previousState: SubmitApplicationState,
  formData: FormData,
): Promise<SubmitApplicationState> {
  const session = await requireVendorSession();

  try {
    await createVendorApplication({
      userId: session.user.id,
      input: {
        companyName: String(formData.get("companyName") ?? ""),
        companyRegistrationNumber: String(formData.get("companyRegistrationNumber") ?? ""),
        serviceCategory: String(formData.get("serviceCategory") ?? ""),
        website: String(formData.get("website") ?? ""),
        description: String(formData.get("description") ?? ""),
        contactPersonName: String(formData.get("contactPersonName") ?? ""),
        contactEmail: String(formData.get("contactEmail") ?? ""),
        justification: String(formData.get("justification") ?? ""),
      },
    });

    revalidatePath("/vendor/application");
    revalidatePath("/vendor");

    return {
      status: "success",
      message: "Application submitted. We'll notify you once it's reviewed.",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to submit application.",
    };
  }
}
