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
  generateInvoiceForVendor,
  reinstateVendorBilling,
  suspendVendorForBilling,
} from "@/lib/billing/invoiceService";
import { prisma } from "@/lib/db/prisma";

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

export async function generateInvoiceAction(formData: FormData) {
  const session = await requireRole(["SUPER_ADMIN"]);
  assertCan("billing:generate", session);

  const vendorProfileId = String(formData.get("vendorProfileId") ?? "");
  const verificationCount = Number(formData.get("verificationCount") ?? "");
  const periodStart = String(formData.get("periodStart") ?? "");
  const periodEnd = String(formData.get("periodEnd") ?? "");

  if (!vendorProfileId || !Number.isFinite(verificationCount) || verificationCount < 0 || !periodStart || !periodEnd) {
    throw new Error("All fields are required to generate an invoice.");
  }

  const vendorProfile = await prisma.vendorProfile.findUnique({
    where: { id: vendorProfileId },
    select: { companyName: true },
  });
  if (!vendorProfile) {
    throw new Error("Vendor not found.");
  }

  await generateInvoiceForVendor(
    vendorProfileId,
    vendorProfile.companyName,
    verificationCount,
    new Date(periodStart),
    new Date(periodEnd),
  );
  revalidatePath("/billing");
}
