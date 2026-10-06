/**
 * @fileoverview Suspends vendors whose wallet stays overdrawn and reinstates them once it recovers.
 * @module lib/vendors/overdraft
 */

import "server-only";

import { AuditAction, VendorPaymentProfileStatus, VendorPaymentSuspensionCode } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { prisma } from "@/lib/db/prisma";
import { sendVendorPaymentsRestoredEmail, sendVendorPaymentsSuspendedEmail } from "@/lib/email/vendor-wallet";
import { formatMoneyMinor } from "@/lib/formatters";
import { getUniversityPaymentWalletSettings } from "@/lib/payments/config";
import { DEFAULT_OVERDRAFT_SUSPENSION_DAYS } from "@/lib/payments/constants";
import { runSerializableTransaction } from "@/lib/payments/posting";

const DAY_MS = 24 * 60 * 60 * 1000;
const ZERO_MINOR = BigInt(0);

const profileWithBalance = {
  id: true,
  status: true,
  suspensionCode: true,
  vendorProfileId: true,
  vendorProfile: {
    select: {
      companyName: true,
      contactEmail: true,
      contactPersonName: true,
      walletAccount: { select: { balance: { select: { postedBalanceMinor: true, negativeSince: true } } } },
    },
  },
} as const;

async function suspensionDays() {
  const settings = await getUniversityPaymentWalletSettings();
  return settings?.paymentWalletOverdraftSuspensionDays ?? DEFAULT_OVERDRAFT_SUSPENSION_DAYS;
}

function contactFor(vendor: { companyName: string; contactEmail: string; contactPersonName: string | null }) {
  return { to: vendor.contactEmail, contactName: vendor.contactPersonName ?? vendor.companyName, companyName: vendor.companyName };
}

async function bestEffort(label: string, send: () => Promise<unknown>) {
  try {
    await send();
  } catch (error) {
    // Email failures never roll back suspension or reinstatement.
    console.error(`Vendor ${label} email failed.`, error);
  }
}

/** E2: suspend APPROVED vendors whose balance has been negative for at least N days. */
export async function suspendOverdrawnVendors(now = new Date()) {
  const days = await suspensionDays();
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const candidates = await prisma.vendorPaymentProfile.findMany({
    where: {
      status: VendorPaymentProfileStatus.APPROVED,
      vendorProfile: { walletAccount: { balance: { postedBalanceMinor: { lt: ZERO_MINOR }, negativeSince: { lte: cutoff } } } },
    },
    select: { id: true },
  });

  const suspended: string[] = [];
  for (const candidate of candidates) {
    const result = await runSerializableTransaction(async (transaction) => {
      const profile = await transaction.vendorPaymentProfile.findUnique({ where: { id: candidate.id }, select: profileWithBalance });
      const balance = profile?.vendorProfile.walletAccount?.balance;
      if (
        profile?.status !== VendorPaymentProfileStatus.APPROVED ||
        !balance?.negativeSince ||
        balance.postedBalanceMinor >= ZERO_MINOR ||
        balance.negativeSince > cutoff
      ) {
        return null;
      }

      const deficitMinor = Number(-balance.postedBalanceMinor);
      await transaction.vendorPaymentProfile.update({
        where: { id: profile.id },
        data: {
          status: VendorPaymentProfileStatus.SUSPENDED,
          suspensionCode: VendorPaymentSuspensionCode.OVERDRAFT,
          suspendedAt: now,
          suspensionReason: `Wallet balance negative for ${days} days (deficit ${formatMoneyMinor(deficitMinor)})`,
        },
      });
      await writeAuditLog({
        action: AuditAction.VENDOR_PAYMENT_SUSPENDED,
        actorId: null,
        targetType: "VendorPaymentProfile",
        targetId: profile.id,
        meta: {
          vendorProfileId: profile.vendorProfileId,
          deficitMinor,
          negativeSince: balance.negativeSince.toISOString(),
          days,
        },
      }, transaction);
      return { profile, deficitMinor };
    });
    if (!result) continue;

    suspended.push(result.profile.vendorProfileId);
    await bestEffort("payments suspended", () => sendVendorPaymentsSuspendedEmail({
      ...contactFor(result.profile.vendorProfile),
      deficitMinor: result.deficitMinor,
      days,
    }));
  }

  return { suspended };
}

async function reinstateProfile(profileId: string) {
  const profile = await runSerializableTransaction(async (transaction) => {
    const current = await transaction.vendorPaymentProfile.findUnique({ where: { id: profileId }, select: profileWithBalance });
    const balance = current?.vendorProfile.walletAccount?.balance;
    // E4: only overdraft suspensions are ever lifted automatically.
    if (
      current?.status !== VendorPaymentProfileStatus.SUSPENDED ||
      current.suspensionCode !== VendorPaymentSuspensionCode.OVERDRAFT ||
      !balance ||
      balance.postedBalanceMinor < ZERO_MINOR
    ) {
      return null;
    }

    await transaction.vendorPaymentProfile.update({
      where: { id: current.id },
      data: {
        status: VendorPaymentProfileStatus.APPROVED,
        suspensionCode: null,
        suspendedAt: null,
        suspensionReason: null,
      },
    });
    await writeAuditLog({
      action: AuditAction.VENDOR_PAYMENT_REINSTATED,
      actorId: null,
      targetType: "VendorPaymentProfile",
      targetId: current.id,
      meta: { vendorProfileId: current.vendorProfileId, balanceMinor: Number(balance.postedBalanceMinor) },
    }, transaction);
    return current;
  });
  if (!profile) return false;

  await bestEffort("payments restored", () => sendVendorPaymentsRestoredEmail(contactFor(profile.vendorProfile)));
  return true;
}

/** E3 backstop: reinstate every overdraft-suspended vendor whose balance is back at zero or above. */
export async function reinstateRecoveredVendors() {
  const candidates = await prisma.vendorPaymentProfile.findMany({
    where: {
      status: VendorPaymentProfileStatus.SUSPENDED,
      suspensionCode: VendorPaymentSuspensionCode.OVERDRAFT,
      vendorProfile: { walletAccount: { balance: { postedBalanceMinor: { gte: ZERO_MINOR } } } },
    },
    select: { id: true, vendorProfileId: true },
  });

  const reinstated: string[] = [];
  for (const candidate of candidates) {
    if (await reinstateProfile(candidate.id)) reinstated.push(candidate.vendorProfileId);
  }
  return { reinstated };
}

/** E3: called right after a vendor top-up completes. */
export async function reinstateIfRecovered(vendorProfileId: string) {
  const profile = await prisma.vendorPaymentProfile.findUnique({ where: { vendorProfileId }, select: { id: true } });
  return profile ? reinstateProfile(profile.id) : false;
}

/** Daily job step 1: reinstate first, then suspend (§5.3). */
export async function runOverdraftMonitor(now = new Date()) {
  const { reinstated } = await reinstateRecoveredVendors();
  const { suspended } = await suspendOverdrawnVendors(now);
  return { reinstated, suspended };
}
