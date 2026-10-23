/**
 * @fileoverview Suspends vendor verification while an invoice is overdue and reinstates it once paid.
 *
 * The portal database is the source of truth; the agent service enforces the
 * suspension at every service point. Agent calls cannot join a database
 * transaction, so each state change sets `verificationAgentSyncPending` and
 * `syncVendorVerificationSuspensions` retries until the agent confirms it.
 * Only payment lifts an `UNPAID_INVOICE` suspension — there is no admin override.
 * Specification: docs/vendor-verification-suspension-plan.md.
 * @module lib/billing/verificationSuspension
 */

import "server-only";

import { AuditAction, VendorVerificationSuspensionCode } from "@/generated/prisma/enums";
import { clearVendorVerificationSuspension, setVendorVerificationSuspension } from "@/lib/agentClient";
import { writeAuditLog } from "@/lib/audit/audit";
import { overdueInvoiceWhere } from "@/lib/billing/overdue";
import type { ConfirmInvoicePaymentResult } from "@/lib/billing/paymentConfirmation";
import { prisma } from "@/lib/db/prisma";
import { PosApiError } from "@/lib/payments/posErrors";
import { runSerializableTransaction } from "@/lib/payments/posting";

export type VendorVerificationSuspension = {
  code: VendorVerificationSuspensionCode;
  suspendedAt: Date;
  reason: string | null;
};

const dueDateFormatter = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: "Africa/Johannesburg" });

/** An open billing exception pauses new suspensions; it never lifts an existing one. */
function suspendingInvoiceWhere(now: Date) {
  return { ...overdueInvoiceWhere(now), hasUnresolvedException: false };
}

function suspensionReason(invoices: Array<{ invoiceNumber: string; dueAt: Date | null }>) {
  const [oldest] = invoices;
  const others = invoices.length - 1;
  const dueText = oldest.dueAt ? ` was due ${dueDateFormatter.format(oldest.dueAt)}` : " is overdue";
  return `Invoice ${oldest.invoiceNumber}${dueText}${others > 0 ? ` (+${others} more overdue)` : ""}`;
}

/** Suspends every unsuspended vendor that has an overdue invoice without an open billing exception. */
export async function suspendOverdueVendors(now = new Date(), options: { vendorProfileId?: string } = {}) {
  const candidates = await prisma.vendorProfile.findMany({
    where: {
      ...(options.vendorProfileId ? { id: options.vendorProfileId } : {}),
      verificationSuspensionCode: null,
      invoices: { some: suspendingInvoiceWhere(now) },
    },
    select: { id: true },
  });

  const suspended: string[] = [];
  for (const candidate of candidates) {
    const vendorProfileId = await runSerializableTransaction(async (transaction) => {
      const vendor = await transaction.vendorProfile.findUnique({
        where: { id: candidate.id },
        select: { verificationSuspensionCode: true },
      });
      if (!vendor || vendor.verificationSuspensionCode) return null;

      // Re-read inside the transaction: a payment may have landed since the scan.
      const invoices = await transaction.vendorInvoice.findMany({
        where: { vendorProfileId: candidate.id, ...suspendingInvoiceWhere(now) },
        orderBy: { dueAt: "asc" },
        select: { id: true, invoiceNumber: true, dueAt: true },
      });
      if (invoices.length === 0) return null;

      await transaction.vendorProfile.update({
        where: { id: candidate.id },
        data: {
          verificationSuspensionCode: VendorVerificationSuspensionCode.UNPAID_INVOICE,
          verificationSuspendedAt: now,
          verificationSuspensionReason: suspensionReason(invoices),
          verificationAgentSyncPending: true,
        },
      });
      await writeAuditLog({
        action: AuditAction.VENDOR_VERIFICATION_SUSPENDED,
        actorId: null,
        targetType: "VendorProfile",
        targetId: candidate.id,
        meta: {
          // Audit metadata is flat, so the overdue invoices are recorded as comma-separated lists.
          invoiceIds: invoices.map((invoice) => invoice.id).join(","),
          invoiceNumbers: invoices.map((invoice) => invoice.invoiceNumber).join(","),
          oldestDueAt: invoices[0].dueAt?.toISOString() ?? null,
        },
      }, transaction);
      return candidate.id;
    });
    if (vendorProfileId) suspended.push(vendorProfileId);
  }

  return { suspended };
}

async function reinstateVendor(vendorProfileId: string, now: Date) {
  return runSerializableTransaction(async (transaction) => {
    const vendor = await transaction.vendorProfile.findUnique({
      where: { id: vendorProfileId },
      select: { verificationSuspensionCode: true, verificationSuspendedAt: true },
    });
    if (vendor?.verificationSuspensionCode !== VendorVerificationSuspensionCode.UNPAID_INVOICE) return false;

    // Every overdue invoice must be settled, including ones held by a billing exception.
    const stillOverdue = await transaction.vendorInvoice.count({
      where: { vendorProfileId, ...overdueInvoiceWhere(now) },
    });
    if (stillOverdue > 0) return false;

    await transaction.vendorProfile.update({
      where: { id: vendorProfileId },
      data: {
        verificationSuspensionCode: null,
        verificationSuspendedAt: null,
        verificationSuspensionReason: null,
        verificationAgentSyncPending: true,
      },
    });
    await writeAuditLog({
      action: AuditAction.VENDOR_VERIFICATION_REINSTATED,
      actorId: null,
      targetType: "VendorProfile",
      targetId: vendorProfileId,
      meta: { suspendedAt: vendor.verificationSuspendedAt?.toISOString() ?? null },
    }, transaction);
    return true;
  });
}

/** Daily backstop: reinstate every suspended vendor with no overdue invoice left. */
export async function reinstateSettledVendors(now = new Date()) {
  const candidates = await prisma.vendorProfile.findMany({
    where: {
      verificationSuspensionCode: VendorVerificationSuspensionCode.UNPAID_INVOICE,
      invoices: { none: overdueInvoiceWhere(now) },
    },
    select: { id: true },
  });

  const reinstated: string[] = [];
  for (const candidate of candidates) {
    if (await reinstateVendor(candidate.id, now)) reinstated.push(candidate.id);
  }
  return { reinstated };
}

/** Called right after an invoice payment is confirmed; reinstates and syncs immediately. */
export async function reinstateVerificationIfSettled(vendorProfileId: string, now = new Date()) {
  const reinstated = await reinstateVendor(vendorProfileId, now);
  if (reinstated) await syncVendorVerificationSuspensions({ vendorProfileId });
  return reinstated;
}

/**
 * Best-effort hook for the Next.js callers of `confirmInvoicePayment`. That
 * function stays free of agent calls because CLI scripts also use it; the
 * daily monitor reinstates anything this misses.
 */
export async function reinstateAfterInvoicePayment(result: ConfirmInvoicePaymentResult) {
  if (result.outcome !== "confirmed" && result.outcome !== "already_confirmed") return;
  try {
    const invoice = await prisma.vendorInvoice.findUnique({
      where: { id: result.invoiceId },
      select: { vendorProfileId: true },
    });
    if (invoice) await reinstateVerificationIfSettled(invoice.vendorProfileId);
  } catch (error) {
    console.error("Vendor verification reinstatement after invoice payment failed.", error);
  }
}

/** Pushes every unsynced suspension state to the agent; failures stay pending for the next run. */
export async function syncVendorVerificationSuspensions(options: { vendorProfileId?: string } = {}) {
  const pending = await prisma.vendorProfile.findMany({
    where: { verificationAgentSyncPending: true, ...(options.vendorProfileId ? { id: options.vendorProfileId } : {}) },
    select: { id: true, verificationSuspensionCode: true, verificationSuspendedAt: true },
  });

  const synced: string[] = [];
  const failed: string[] = [];
  for (const vendor of pending) {
    try {
      if (vendor.verificationSuspensionCode && vendor.verificationSuspendedAt) {
        await setVendorVerificationSuspension(vendor.id, {
          code: vendor.verificationSuspensionCode,
          suspendedAt: vendor.verificationSuspendedAt.toISOString(),
        });
      } else {
        await clearVendorVerificationSuspension(vendor.id);
      }
      // Only clear the flag if the state we pushed is still current; a change
      // made meanwhile keeps it pending so the next sync sends the new state.
      await prisma.vendorProfile.updateMany({
        where: {
          id: vendor.id,
          verificationAgentSyncPending: true,
          verificationSuspensionCode: vendor.verificationSuspensionCode,
        },
        data: { verificationAgentSyncPending: false },
      });
      synced.push(vendor.id);
    } catch (error) {
      console.error(`Vendor verification suspension sync failed for ${vendor.id}.`, error);
      failed.push(vendor.id);
    }
  }
  return { synced, failed };
}

/**
 * Test tools only: after backfilled invoices are issued with their historical
 * dates, applies what the daily job would already have done for that vendor,
 * using the same rule and audit trail.
 */
export async function suspendVendorIfOverdue(vendorProfileId: string, now = new Date()) {
  await suspendOverdueVendors(now, { vendorProfileId });
  const agentSync = await syncVendorVerificationSuspensions({ vendorProfileId });
  return { suspension: await getVendorVerificationSuspension(vendorProfileId), agentSync };
}

/** Daily job step: reinstate first, then suspend, then push both to the agent. */
export async function runVerificationSuspensionMonitor(now = new Date()) {
  const { reinstated } = await reinstateSettledVendors(now);
  const { suspended } = await suspendOverdueVendors(now);
  const agentSync = await syncVendorVerificationSuspensions();
  return { reinstated, suspended, agentSync };
}

export async function getVendorVerificationSuspension(vendorProfileId: string): Promise<VendorVerificationSuspension | null> {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: vendorProfileId },
    select: { verificationSuspensionCode: true, verificationSuspendedAt: true, verificationSuspensionReason: true },
  });
  if (!vendor?.verificationSuspensionCode || !vendor.verificationSuspendedAt) return null;
  return {
    code: vendor.verificationSuspensionCode,
    suspendedAt: vendor.verificationSuspendedAt,
    reason: vendor.verificationSuspensionReason,
  };
}

/** Refuses new verification work for a suspended vendor before any agent call is made. */
export async function assertVendorVerificationAllowed(vendorProfileId: string) {
  if (await getVendorVerificationSuspension(vendorProfileId)) {
    throw new PosApiError(
      "VENDOR_VERIFICATION_SUSPENDED",
      "This vendor's verifications are suspended until overdue invoices are paid.",
      403,
    );
  }
}
