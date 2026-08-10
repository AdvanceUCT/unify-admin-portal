/**
 * @fileoverview Contains the server actions used by the `/vendor/staff` workflow.
 * @module app/vendor/(portal)/staff/actions
 */

"use server";

import { revalidatePath } from "next/cache";

import { requireVendorOwnerContext } from "@/lib/vendors/context";
import {
  createVendorStaffInvite,
  revokeVendorStaffInvite,
  setVendorStaffActive,
  updateVendorStaffBranches,
} from "@/lib/vendors/staff";

export type StaffInviteState = {
  error?: string;
  success?: string;
  resetKey?: string;
  values?: {
    branchIds: string[];
    email: string;
    name: string;
  };
};

export async function createStaffInviteAction(
  _state: StaffInviteState,
  formData: FormData,
): Promise<StaffInviteState> {
  const { session, context } = await requireVendorOwnerContext();
  const values = {
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? ""),
    branchIds: formData.getAll("branchId").map(String).filter(Boolean),
  };
  if (values.branchIds.length === 0) {
    return {
      error: "Select at least one branch before sending the invite.",
      resetKey: String(Date.now()),
      values,
    };
  }

  try {
    await createVendorStaffInvite(context.vendorProfileId, session.user.id, {
      email: values.email,
      name: values.name,
      branchIds: values.branchIds,
    });
    revalidatePath("/vendor/staff");
    return { resetKey: String(Date.now()), success: "Invite created." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to create invite.",
      resetKey: String(Date.now()),
      values,
    };
  }
}

export async function updateStaffBranchesAction(formData: FormData) {
  const { session, context } = await requireVendorOwnerContext();
  await updateVendorStaffBranches(
    context.vendorProfileId,
    String(formData.get("membershipId") ?? ""),
    session.user.id,
    formData.getAll("branchId").map(String),
  );
  revalidatePath("/vendor/staff");
}

export async function setStaffActiveAction(formData: FormData) {
  const { session, context } = await requireVendorOwnerContext();
  await setVendorStaffActive(
    context.vendorProfileId,
    String(formData.get("membershipId") ?? ""),
    session.user.id,
    formData.get("active") === "true",
  );
  revalidatePath("/vendor/staff");
}

export async function revokeStaffInviteAction(formData: FormData) {
  const { session, context } = await requireVendorOwnerContext();
  await revokeVendorStaffInvite(context.vendorProfileId, String(formData.get("inviteId") ?? ""), session.user.id);
  revalidatePath("/vendor/staff");
}
