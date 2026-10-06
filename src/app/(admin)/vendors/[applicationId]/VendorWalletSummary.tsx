/**
 * @fileoverview Read-only vendor wallet, overdraft and payment-suspension summary for the admin vendor page (spec §9.5).
 * @module app/(admin)/vendors/[applicationId]/VendorWalletSummary
 */

import { Badge } from "@/components/ui/Badge";
import { prisma } from "@/lib/db/prisma";
import { formatAcademicDateTime, formatMoneyMinor } from "@/lib/formatters";
import { getUniversityPaymentWalletSettings } from "@/lib/payments/config";
import { DEFAULT_OVERDRAFT_SUSPENSION_DAYS } from "@/lib/payments/constants";

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_TONE = {
  PENDING: "warning",
  APPROVED: "success",
  SUSPENDED: "danger",
  CLOSED: "neutral",
} as const;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-fg">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export async function VendorWalletSummary({ vendorProfileId }: { vendorProfileId: string }) {
  const [paymentProfile, walletAccount, settings] = await Promise.all([
    prisma.vendorPaymentProfile.findUnique({
      where: { vendorProfileId },
      select: { status: true, suspensionCode: true, suspendedAt: true, suspensionReason: true },
    }),
    prisma.walletAccount.findUnique({
      where: { vendorProfileId },
      select: { currency: true, balance: { select: { postedBalanceMinor: true, negativeSince: true } } },
    }),
    getUniversityPaymentWalletSettings(),
  ]);
  if (!paymentProfile && !walletAccount) return null;

  const currency = walletAccount?.currency ?? "ZAR";
  const balanceMinor = Number(walletAccount?.balance?.postedBalanceMinor ?? 0);
  const negativeSince = balanceMinor < 0 ? walletAccount?.balance?.negativeSince ?? null : null;
  const suspensionDays = settings?.paymentWalletOverdraftSuspensionDays ?? DEFAULT_OVERDRAFT_SUSPENSION_DAYS;
  const suspended = paymentProfile?.status === "SUSPENDED";

  return (
    <section className="space-y-6 rounded-xl border border-border bg-surface p-6 shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-section-title text-fg">Payment wallet</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Wallet balance, overdraft and payment status. Read only; overdraft suspensions lift automatically once the
            balance recovers.
          </p>
        </div>
        {paymentProfile ? (
          <Badge tone={STATUS_TONE[paymentProfile.status]}>{paymentProfile.status}</Badge>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-lg bg-surface-muted p-4">
          <h3 className="text-sm font-semibold text-fg">Balance</h3>
          <dl className="grid gap-3 text-sm text-fg-muted">
            <Row
              label="Wallet balance"
              value={
                <span className={balanceMinor < 0 ? "font-medium text-danger-fg" : undefined}>
                  {formatMoneyMinor(balanceMinor, currency)}
                </span>
              }
            />
            {negativeSince ? (
              <>
                <Row label="Overdraft" value={formatMoneyMinor(-balanceMinor, currency)} />
                <Row label="Negative since" value={formatAcademicDateTime(negativeSince.toISOString())} />
                {!suspended ? (
                  <Row
                    label="Suspends on"
                    value={formatAcademicDateTime(new Date(negativeSince.getTime() + suspensionDays * DAY_MS).toISOString())}
                  />
                ) : null}
              </>
            ) : (
              <Row label="Overdraft" value="None" />
            )}
          </dl>
        </div>

        <div className="space-y-4 rounded-lg bg-surface-muted p-4">
          <h3 className="text-sm font-semibold text-fg">Payment status</h3>
          <dl className="grid gap-3 text-sm text-fg-muted">
            <Row label="Payment profile" value={paymentProfile?.status ?? "Not set up"} />
            {suspended ? (
              <>
                <Row label="Suspension cause" value={paymentProfile?.suspensionCode === "OVERDRAFT" ? "Overdraft" : "Manual"} />
                <Row
                  label="Suspended"
                  value={paymentProfile?.suspendedAt ? formatAcademicDateTime(paymentProfile.suspendedAt.toISOString()) : "Not recorded"}
                />
                {paymentProfile?.suspensionReason ? <Row label="Reason" value={paymentProfile.suspensionReason} /> : null}
              </>
            ) : null}
          </dl>
        </div>
      </div>
    </section>
  );
}
