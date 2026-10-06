/**
 * @fileoverview Renders the authenticated administrator page at `/settings/payment-wallet`.
 * @module app/(admin)/settings/payment-wallet/page
 */

import { Gauge, SlidersHorizontal, Wallet } from "lucide-react";

import { VendorPaymentProfileStatus, WalletAccountType } from "@/generated/prisma/enums";
import { requireRoleForRender } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatMoneyMinor } from "@/lib/formatters";
import { getUniversityPaymentWalletSettings } from "@/lib/payments/config";
import { SettingsCard, SettingsField } from "../SettingsCard";
import { PaymentWalletSettingsForm } from "./PaymentWalletSettingsForm";

/**
 * `SUPER_ADMIN` and `ADMIN` may view the payment wallet policy; only
 * `SUPER_ADMIN` may change it (spec §3.6, same as the verification-billing policy).
 */
export default async function PaymentWalletSettingsPage() {
  const session = await requireRoleForRender(["SUPER_ADMIN", "ADMIN"]);
  const canEdit = session.user.role === "SUPER_ADMIN";

  const [settings, negativeVendors, suspendedVendors] = await Promise.all([
    getUniversityPaymentWalletSettings(),
    prisma.walletAccountBalance.count({
      where: { postedBalanceMinor: { lt: 0 }, account: { type: WalletAccountType.VENDOR } },
    }),
    prisma.vendorPaymentProfile.count({ where: { status: VendorPaymentProfileStatus.SUSPENDED } }),
  ]);

  if (!settings) {
    return (
      <SettingsCard icon={Wallet} title="Payment wallet">
        <p className="text-sm text-fg-subtle">No university profile exists yet. Complete the setup wizard first.</p>
      </SettingsCard>
    );
  }

  const thresholdMinor = Number(settings.paymentWalletPayoutThresholdMinor);

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-subtle">
        Vendor payouts and overdraft rules for the student payment wallet. Refunds have no time limit; a refund may
        take a vendor wallet below zero, which pauses payouts until it recovers.
      </p>

      <SettingsCard
        description="Platform-wide values used by the nightly payout and overdraft run."
        icon={Wallet}
        title="Current policy"
      >
        <div className="divide-y divide-border">
          <SettingsField label="Payout threshold" value={formatMoneyMinor(thresholdMinor)} />
          <SettingsField
            label="Overdraft suspension"
            value={`After ${settings.paymentWalletOverdraftSuspensionDays} ${settings.paymentWalletOverdraftSuspensionDays === 1 ? "day" : "days"} negative`}
          />
          <SettingsField label="Payout run" value="Daily at about 00:35 SAST" />
        </div>
      </SettingsCard>

      <SettingsCard
        description="Vendors whose wallet needs attention right now."
        icon={Gauge}
        title="Vendor wallet status"
      >
        <div className="divide-y divide-border">
          <SettingsField label="Vendors with a negative balance" value={negativeVendors} />
          <SettingsField label="Vendors with payments suspended" value={suspendedVendors} />
        </div>
      </SettingsCard>

      {canEdit ? (
        <SettingsCard
          description="Vendors are paid their full available balance once it reaches the threshold. Lower it temporarily to demo payouts with small amounts."
          icon={SlidersHorizontal}
          title="Change payment wallet settings"
        >
          <PaymentWalletSettingsForm
            overdraftSuspensionDays={settings.paymentWalletOverdraftSuspensionDays}
            payoutThreshold={(thresholdMinor / 100).toFixed(2)}
          />
        </SettingsCard>
      ) : null}
    </div>
  );
}
