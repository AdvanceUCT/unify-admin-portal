/**
 * @fileoverview Contains the server actions used by the `/vendors` workflow.
 * @module app/(admin)/vendors/actions
 */

"use server";

import { revalidatePath } from "next/cache";

import { assertCan } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import {
  ensureVendorVerificationServicePoint,
  markApplicationViewed,
  reviewVendorApplication,
  revokeVendorApplication,
} from "@/lib/vendors/applications";

async function reviewAction(formData: FormData, decision: "APPROVED" | "REJECTED") {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("vendor:write", session);

  const applicationId = String(formData.get("applicationId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!applicationId) return;

  if (decision === "REJECTED" && !notes) {
    throw new Error("A rejection reason is required.");
  }

  await reviewVendorApplication({
    applicationId,
    decision,
    reviewerId: session.user.id,
    notes: notes || undefined,
  });

  revalidatePath("/vendors", "layout");
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

export async function markVendorApplicationViewedAction(applicationId: string) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("vendor:read", session);

  if (!applicationId.trim()) return;

  await markApplicationViewed({ applicationId });
  revalidatePath("/vendors");
}

export async function createVendorVerificationQrAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("vendor:write", session);

  const vendorProfileId = String(formData.get("vendorProfileId") ?? "");
  if (!vendorProfileId.trim()) return;

  await ensureVendorVerificationServicePoint(vendorProfileId);
  revalidatePath("/vendors", "layout");
  revalidatePath("/vendor");
}
