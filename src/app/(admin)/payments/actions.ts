/**
 * @fileoverview Contains the server actions used by the `/payments` workflow.
 * @module app/(admin)/payments/actions
 */

"use server";

import { revalidatePath } from "next/cache";

import { assertCan } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import {
  reviewVendorPaymentApplication,
  revokeVendorPaymentApplication,
  setCampusStatus,
} from "@/lib/payments/partnerships";

async function reviewAction(formData: FormData, decision: "APPROVED" | "REJECTED") {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("payment:write", session);

  const applicationId = String(formData.get("applicationId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!applicationId) return;

  if (decision === "REJECTED" && !notes) {
    throw new Error("A rejection reason is required.");
  }

  await reviewVendorPaymentApplication({
    applicationId,
    decision,
    reviewerId: session.user.id,
    notes: notes || undefined,
  });

  revalidatePath("/payments", "layout");
}

export async function approveVendorPaymentApplicationAction(formData: FormData) {
  await reviewAction(formData, "APPROVED");
}

export async function rejectVendorPaymentApplicationAction(formData: FormData) {
  await reviewAction(formData, "REJECTED");
}

export async function revokeVendorPaymentApplicationAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("payment:write", session);

  const applicationId = String(formData.get("applicationId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!applicationId) return;

  await revokeVendorPaymentApplication({
    applicationId,
    reviewerId: session.user.id,
    notes,
  });

  revalidatePath("/payments", "layout");
}

export async function setCampusStatusAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("payment:write", session);

  const partnershipId = String(formData.get("partnershipId") ?? "");
  const campusStatus = String(formData.get("campusStatus") ?? "");
  if (!partnershipId || (campusStatus !== "ON_CAMPUS" && campusStatus !== "OFF_CAMPUS")) return;

  await setCampusStatus({ partnershipId, campusStatus, actorId: session.user.id });
  revalidatePath("/payments", "layout");
}
