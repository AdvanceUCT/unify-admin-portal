/**
 * @fileoverview Contains the server actions used by the `/accept-invite` workflow.
 * @module app/(public)/accept-invite/actions
 */

"use server";

import { redirect } from "next/navigation";

import { acceptAdminInvite } from "@/lib/auth/invites";

export type AcceptInviteState = {
  status: "idle" | "error";
  message?: string;
};

export async function acceptInviteAction(
  _previousState: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  try {
    await acceptAdminInvite({
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

  redirect("/sign-in?inviteAccepted=1");
}
