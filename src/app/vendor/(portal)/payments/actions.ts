/**
 * @fileoverview Contains the server actions used by the `/vendor/payments` workflow.
 * @module app/vendor/(portal)/payments/actions
 */

"use server";

import { revalidatePath } from "next/cache";

import { requireVendorOwnerContext } from "@/lib/vendors/context";
import { getPartnershipForVendor, submitVendorPaymentApplication } from "@/lib/payments/partnerships";

export type SubmitPaymentApplicationState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function submitVendorPaymentApplicationAction(
  _previousState: SubmitPaymentApplicationState,
  formData: FormData,
): Promise<SubmitPaymentApplicationState> {
  const { session, context } = await requireVendorOwnerContext();

  const partnership = await getPartnershipForVendor(context.vendorProfileId);
  if (!partnership) {
    return {
      status: "error",
      message: "Your university partnership isn't set up yet. Contact your university administrator.",
    };
  }

  try {
    await submitVendorPaymentApplication({
      partnershipId: partnership.id,
      justification: String(formData.get("justification") ?? ""),
      userId: session.user.id,
    });

    revalidatePath("/vendor/payments");
    revalidatePath("/vendor");
    return { status: "success", message: "Your request has been submitted for review." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to submit your request.",
    };
  }
}
