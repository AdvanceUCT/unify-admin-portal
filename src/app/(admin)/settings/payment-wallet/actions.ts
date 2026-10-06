/**
 * @fileoverview Server actions for `/settings/payment-wallet`.
 * @module app/(admin)/settings/payment-wallet/actions
 */

"use server";

import { revalidatePath } from "next/cache";

import { AuditAction } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit/audit";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { OVERDRAFT_SUSPENSION_DAYS_MAX } from "@/lib/payments/constants";

export type PaymentWalletSettingsResult = { status: "saved" } | { status: "error"; message: string };

const RAND_AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/;

function parseThresholdMinor(value: string) {
  const trimmed = value.trim();
  if (!RAND_AMOUNT_PATTERN.test(trimmed)) return null;
  const amountMinor = Math.round(Number(trimmed) * 100);
  return Number.isSafeInteger(amountMinor) && amountMinor > 0 ? amountMinor : null;
}

function parseSuspensionDays(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const days = Number(trimmed);
  return days >= 1 && days <= OVERDRAFT_SUSPENSION_DAYS_MAX ? days : null;
}

/**
 * SUPER_ADMIN only (spec §3.6). Updates the platform-wide payout threshold and
 * overdraft suspension days; both take effect at the next nightly run.
 */
export async function updatePaymentWalletSettingsAction(formData: FormData): Promise<PaymentWalletSettingsResult> {
  const session = await requireRole(["SUPER_ADMIN"]);

  const thresholdMinor = parseThresholdMinor(String(formData.get("payoutThreshold") ?? ""));
  if (thresholdMinor === null) {
    return { status: "error", message: "Payout threshold must be an amount in rand greater than zero, e.g. 500.00." };
  }
  const suspensionDays = parseSuspensionDays(String(formData.get("overdraftSuspensionDays") ?? ""));
  if (suspensionDays === null) {
    return {
      status: "error",
      message: `Overdraft suspension must be a whole number of days between 1 and ${OVERDRAFT_SUSPENSION_DAYS_MAX}.`,
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const universities = await tx.universityProfile.findMany({
      take: 2,
      select: { id: true, paymentWalletPayoutThresholdMinor: true, paymentWalletOverdraftSuspensionDays: true },
    });
    if (universities.length !== 1) return false;
    const [current] = universities;

    await tx.universityProfile.update({
      where: { id: current.id },
      data: {
        paymentWalletPayoutThresholdMinor: BigInt(thresholdMinor),
        paymentWalletOverdraftSuspensionDays: suspensionDays,
      },
    });
    await writeAuditLog({
      action: AuditAction.PAYMENT_WALLET_SETTINGS_UPDATED,
      actorId: session.user.id,
      targetType: "UniversityProfile",
      targetId: current.id,
      meta: {
        oldPayoutThresholdMinor: Number(current.paymentWalletPayoutThresholdMinor),
        newPayoutThresholdMinor: thresholdMinor,
        oldOverdraftSuspensionDays: current.paymentWalletOverdraftSuspensionDays,
        newOverdraftSuspensionDays: suspensionDays,
      },
    }, tx);
    return true;
  });
  if (!updated) {
    return { status: "error", message: "Exactly one university profile is required. Complete the setup wizard first." };
  }

  revalidatePath("/settings/payment-wallet");
  return { status: "saved" };
}
