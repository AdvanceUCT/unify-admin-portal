/**
 * @fileoverview Server actions for `/vendors/invoices/[invoiceId]`.
 * @module app/(admin)/vendors/invoices/[invoiceId]/actions
 */

"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit/audit";
import { assertCan } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { confirmInvoicePayment } from "@/lib/billing/paymentConfirmation";
import { prisma } from "@/lib/db/prisma";
import { resolvePaystackProviderConfig } from "@/lib/paymentProviders/paystack/config";

/**
 * `invoice:reconcile`. Manual support recovery for one invoice's most
 * recent unresolved attempt — an admin can report status but never pays as
 * the owner; this only re-verifies an existing attempt, it never starts one.
 */
export async function reconcileInvoicePaymentAction(invoiceId: string) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("invoice:reconcile", session);

  const attempt = await prisma.vendorInvoicePaymentAttempt.findFirst({
    where: { invoiceId, status: { in: ["READY", "PENDING", "UNKNOWN"] } },
    orderBy: { createdAt: "desc" },
    select: { reference: true },
  });
  if (!attempt) {
    throw new Error("There is no unresolved payment attempt to reconcile for this invoice.");
  }

  const config = resolvePaystackProviderConfig();
  const result = await confirmInvoicePayment(prisma, { reference: attempt.reference, config });

  await writeAuditLog({
    action: "INVOICE_PAYMENT_RECONCILED",
    actorId: session.user.id,
    targetType: "VendorInvoice",
    targetId: invoiceId,
    meta: { outcome: result.outcome },
  });

  revalidatePath(`/vendors/invoices/${invoiceId}`);
  revalidatePath("/vendors/invoices");
}
