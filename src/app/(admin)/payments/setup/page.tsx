/**
 * @fileoverview Renders the authenticated administrator page at `/payments/setup`.
 * @module app/(admin)/payments/setup/page
 */

import { CreditCard } from "lucide-react";

import { SettingsCard, SettingsField } from "@/app/(admin)/settings/SettingsCard";
import { requireRole } from "@/lib/auth/session";
import { getUniversityPaymentSettings } from "@/lib/payments/settings";
import { getUniversityProfile } from "@/lib/university/profile";
import {
  PaymentContactsForm,
  PaymentServicesEnableForm,
  PaystackKeyForm,
} from "../PaymentSettingsForm";

export default async function PaymentSetupPage() {
  await requireRole(["SUPER_ADMIN", "ADMIN"]);

  const profile = await getUniversityProfile();
  const paymentSettings = profile ? await getUniversityPaymentSettings(profile.id) : null;

  return (
    <div className="space-y-6">
      <SettingsCard
        description="Enable Paystack-backed wallet payments, set finance/technical contacts and payout cadence, and store Paystack keys."
        icon={CreditCard}
        title="Payment services"
      >
        {profile ? (
          <div className="space-y-5">
            <PaymentServicesEnableForm enabled={profile.paymentServicesEnabled} />
            <div className="border-t border-border pt-5">
              <PaymentContactsForm
                financeContactEmail={paymentSettings?.financeContactEmail ?? ""}
                financeContactName={paymentSettings?.financeContactName ?? ""}
                payoutCadence={paymentSettings?.payoutCadence ?? "WEEKLY"}
                technicalContactEmail={paymentSettings?.technicalContactEmail ?? ""}
                technicalContactName={paymentSettings?.technicalContactName ?? ""}
              />
            </div>
            <div className="border-t border-border pt-5">
              <div className="mb-3 divide-y divide-border">
                <SettingsField
                  label="Test key"
                  value={
                    paymentSettings?.paystackTestKeyValidatedAt
                      ? `Configured, validated ${paymentSettings.paystackTestKeyValidatedAt.toLocaleDateString("en-GB")}`
                      : "Not set"
                  }
                />
                <SettingsField
                  label="Live key"
                  value={
                    paymentSettings?.paystackLiveKeyValidatedAt
                      ? `Configured, validated ${paymentSettings.paystackLiveKeyValidatedAt.toLocaleDateString("en-GB")}`
                      : "Not set"
                  }
                />
              </div>
              <PaystackKeyForm />
            </div>
          </div>
        ) : (
          <p className="text-sm text-fg-subtle">
            No university profile exists yet. Complete the setup wizard first.
          </p>
        )}
      </SettingsCard>
    </div>
  );
}
