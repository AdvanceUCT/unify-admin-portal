/**
 * @fileoverview Contains the server actions used by the `/billing` workflow.
 * @module app/(admin)/billing/actions
 */

"use server";

import { revalidatePath } from "next/cache";

import { assertCan } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import {
  flagVendorInvoice,
  generateMonthlyInvoicesForVendors,
  reinstateVendorBilling,
  suspendVendorForBilling,
} from "@/lib/billing/invoiceService";

export async function flagInvoiceAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("billing:write", session);

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!invoiceId) return;

  if (!notes) {
    throw new Error("Notes are required to flag an invoice.");
  }

  await flagVendorInvoice(invoiceId, session.user.id, notes);
  revalidatePath("/billing");
}

export async function suspendVendorAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("billing:write", session);

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const vendorProfileId = String(formData.get("vendorProfileId") ?? "");
  if (!invoiceId || !vendorProfileId) return;

  await suspendVendorForBilling(vendorProfileId, session.user.id, invoiceId);
  revalidatePath("/billing");
}

export async function reinstateVendorAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("billing:write", session);

  const vendorProfileId = String(formData.get("vendorProfileId") ?? "");
  if (!vendorProfileId) return;

  await reinstateVendorBilling(vendorProfileId, session.user.id);
  revalidatePath("/billing");
}

/**
 * Manually triggers the automated monthly invoice run — the same
 * verification-count-driven generation the cron job runs on the 1st of each
 * month — for backfills or testing. Takes no input: there is nothing to
 * enter, since every vendor's count and rate are always computed.
 */
export async function runInvoiceGenerationAction() {
  const session = await requireRole(["SUPER_ADMIN"]);
  assertCan("billing:generate", session);

  await generateMonthlyInvoicesForVendors();
  revalidatePath("/billing");
}
