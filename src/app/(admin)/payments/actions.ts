/**
 * @fileoverview Contains the server actions used by the `/payments` workflow.
 * @module app/(admin)/payments/actions
 */

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertCan } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import {
  reviewVendorPaymentApplication,
  revokeVendorPaymentApplication,
  setCampusStatus,
} from "@/lib/payments/partnerships";
import { PaystackKeyError } from "@/lib/payments/paystackClient";
import { enablePaymentServices, savePaystackKey, upsertPaymentContacts } from "@/lib/payments/settings";
import { getUniversityProfile } from "@/lib/university/profile";

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

export type PaymentSettingsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const paymentContactsSchema = z.object({
  financeContactName: z.string().trim().max(200).optional(),
  financeContactEmail: z.union([z.string().trim().email(), z.literal("")]).optional(),
  technicalContactName: z.string().trim().max(200).optional(),
  technicalContactEmail: z.union([z.string().trim().email(), z.literal("")]).optional(),
  payoutCadence: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
});

export async function savePaymentContactsAction(
  _previousState: PaymentSettingsActionState,
  formData: FormData,
): Promise<PaymentSettingsActionState> {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const parsed = paymentContactsSchema.safeParse({
    financeContactName: String(formData.get("financeContactName") ?? ""),
    financeContactEmail: String(formData.get("financeContactEmail") ?? ""),
    technicalContactName: String(formData.get("technicalContactName") ?? ""),
    technicalContactEmail: String(formData.get("technicalContactEmail") ?? ""),
    payoutCadence: String(formData.get("payoutCadence") ?? "WEEKLY"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the form and try again.",
    };
  }

  const profile = await getUniversityProfile();
  if (!profile) {
    return { status: "error", message: "No university profile exists yet. Complete setup first." };
  }

  try {
    await upsertPaymentContacts(profile.id, session.user.id, parsed.data);
    revalidatePath("/payments/setup");
    return { status: "success", message: "Payment contacts updated." };
  } catch {
    return { status: "error", message: "Unable to update payment contacts. Please try again." };
  }
}

const paystackKeySchema = z.object({
  apiKey: z.string().trim().min(1, "Enter a Paystack secret key."),
});

export async function savePaystackKeyAction(
  _previousState: PaymentSettingsActionState,
  formData: FormData,
): Promise<PaymentSettingsActionState> {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  const parsed = paystackKeySchema.safeParse({ apiKey: String(formData.get("apiKey") ?? "") });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Enter a Paystack secret key.",
    };
  }

  const profile = await getUniversityProfile();
  if (!profile) {
    return { status: "error", message: "No university profile exists yet. Complete setup first." };
  }

  try {
    const { mode } = await savePaystackKey(profile.id, session.user.id, parsed.data.apiKey);
    revalidatePath("/payments/setup");
    return {
      status: "success",
      message: `Paystack ${mode.toLowerCase()} key validated and saved.`,
    };
  } catch (error) {
    if (error instanceof PaystackKeyError) {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "Unable to save this Paystack key. Please try again." };
  }
}

export async function enablePaymentServicesAction(): Promise<PaymentSettingsActionState> {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);

  const profile = await getUniversityProfile();
  if (!profile) {
    return { status: "error", message: "No university profile exists yet. Complete setup first." };
  }

  try {
    await enablePaymentServices(profile.id, session.user.id);
    revalidatePath("/payments", "layout");
    revalidatePath("/", "layout");
    return { status: "success", message: "Payment services enabled." };
  } catch {
    return { status: "error", message: "Unable to enable payment services. Please try again." };
  }
}
