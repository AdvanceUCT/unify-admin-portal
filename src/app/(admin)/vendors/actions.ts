"use server";

import { revalidatePath } from "next/cache";

import { assertCan } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { reviewVendorApplication, revokeVendorApplication } from "@/lib/vendors/applications";

async function reviewAction(formData: FormData, decision: "APPROVED" | "REJECTED") {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("vendor:write", session);

  const applicationId = String(formData.get("applicationId") ?? "");

  if (!applicationId) {
    return;
  }

  await reviewVendorApplication({
    applicationId,
    decision,
    reviewerId: session.user.id,
  });

  revalidatePath("/vendors");
}

export async function approveVendorApplicationAction(formData: FormData) {
  await reviewAction(formData, "APPROVED");
}

export async function rejectVendorApplicationAction(formData: FormData) {
  await reviewAction(formData, "REJECTED");
}

export async function revokeVendorApplicationAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("vendor:write", session);

  const applicationId = String(formData.get("applicationId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!applicationId) {
    return;
  }

  await revokeVendorApplication({
    applicationId,
    reviewerId: session.user.id,
    notes,
  });

  revalidatePath("/vendors");
}
