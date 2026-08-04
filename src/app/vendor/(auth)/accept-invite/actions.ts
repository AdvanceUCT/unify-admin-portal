"use server";

import { redirect } from "next/navigation";

import { acceptVendorInvite } from "@/lib/vendors/invites";

export type AcceptVendorInviteState = {
  status: "idle" | "error";
  message?: string;
};

export async function acceptVendorInviteAction(
  _previousState: AcceptVendorInviteState,
  formData: FormData,
): Promise<AcceptVendorInviteState> {
  try {
    await acceptVendorInvite({
      token: String(formData.get("token") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to accept invite.",
    };
  }

  redirect("/vendor/sign-in?inviteAccepted=1");
}
