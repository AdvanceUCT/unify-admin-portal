/**
 * @fileoverview Server actions for vendor wallet-payment payout settings.
 * @module app/vendor/(portal)/payments/actions
 */

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { saveVendorPayoutDestination } from "@/lib/vendors/payouts";
import { requireVendorOwnerContext } from "@/lib/vendors/context";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

export async function savePayoutDestinationAction(formData: FormData) {
  const { session, context } = await requireVendorOwnerContext();
  try {
    await saveVendorPayoutDestination(context, session.user.id, {
      accountHolderName: readString(formData, "accountHolderName"),
      accountNumber: readString(formData, "accountNumber"),
      bankCode: readString(formData, "bankCode"),
      bankName: readString(formData, "bankName"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save payout details.";
    redirect(`/vendor/payments?payoutError=${encodeURIComponent(message)}`);
  }

  revalidatePath("/vendor/payments");
  redirect("/vendor/payments?payout=updated");
}
