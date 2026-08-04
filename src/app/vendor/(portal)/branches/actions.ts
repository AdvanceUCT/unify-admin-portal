"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createVendorBranch,
  provisionVendorBranch,
  setDefaultVendorBranch,
  setVendorBranchActive,
  updateVendorBranch,
} from "@/lib/vendors/branches";
import { requireVendorOwnerContext } from "@/lib/vendors/context";

export type BranchActionState = { error?: string };

export async function createBranchAction(
  _state: BranchActionState,
  formData: FormData,
): Promise<BranchActionState> {
  const { session, context } = await requireVendorOwnerContext();
  try {
    const branch = await createVendorBranch(context.vendorProfileId, session.user.id, {
      name: String(formData.get("name") ?? ""),
      address: String(formData.get("address") ?? ""),
    });
    revalidatePath("/vendor");
    revalidatePath("/vendor/branches");
    redirect(`/vendor/branches/${branch.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: error instanceof Error ? error.message : "Unable to create branch." };
  }
}

export async function updateBranchAction(formData: FormData) {
  const { context } = await requireVendorOwnerContext();
  const branchId = String(formData.get("branchId") ?? "");
  await updateVendorBranch(context.vendorProfileId, branchId, {
    name: String(formData.get("name") ?? ""),
    address: String(formData.get("address") ?? ""),
  });
  revalidatePath(`/vendor/branches/${branchId}`);
  revalidatePath("/vendor/branches");
}

export async function retryBranchProvisioningAction(formData: FormData) {
  const { context } = await requireVendorOwnerContext();
  const branchId = String(formData.get("branchId") ?? "");
  if (!context.branchIds.includes(branchId)) throw new Error("Branch was not found.");
  await provisionVendorBranch(branchId);
  revalidatePath(`/vendor/branches/${branchId}`);
  revalidatePath("/vendor/branches");
}

export async function setBranchActiveAction(formData: FormData) {
  const { context } = await requireVendorOwnerContext();
  const branchId = String(formData.get("branchId") ?? "");
  await setVendorBranchActive(context.vendorProfileId, branchId, formData.get("active") === "true");
  revalidatePath(`/vendor/branches/${branchId}`);
  revalidatePath("/vendor/branches");
}

export async function setDefaultBranchAction(formData: FormData) {
  const { context } = await requireVendorOwnerContext();
  const branchId = String(formData.get("branchId") ?? "");
  await setDefaultVendorBranch(context.vendorProfileId, branchId);
  revalidatePath("/vendor");
  revalidatePath("/vendor/branches");
  revalidatePath(`/vendor/branches/${branchId}`);
}
