"use server";

import { redirect } from "next/navigation";

import { acceptVendorStaffInvite } from "@/lib/vendors/staff";

export type AcceptVendorInviteState = { error?: string };

export async function acceptVendorInviteAction(
  _state: AcceptVendorInviteState,
  formData: FormData,
): Promise<AcceptVendorInviteState> {
  try {
    await acceptVendorStaffInvite({
      token: String(formData.get("token") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to accept invite." };
  }
  redirect("/vendor/sign-in?inviteAccepted=1");
}
