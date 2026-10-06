/**
 * @fileoverview Compact overdraft and payment-suspension alert for the vendor payments page (spec §9.2).
 * @module app/vendor/(portal)/payments/VendorWalletStatusBanner
 */

import { AlertTriangle, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { formatMoneyMinor } from "@/lib/formatters";
import type { getVendorPayoutOverview } from "@/lib/vendors/payouts";

type PayoutOverview = Awaited<ReturnType<typeof getVendorPayoutOverview>>;

const dateFormatter = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: "Africa/Johannesburg" });

const TONE = {
  warning: { box: "border-warning-border bg-warning-bg", text: "text-warning-fg", Icon: AlertTriangle },
  danger: { box: "border-danger-border bg-danger-bg", text: "text-danger-fg", Icon: ShieldAlert },
} as const;

function Alert({
  action,
  detail,
  title,
  tone,
}: {
  action?: React.ReactNode;
  detail: string;
  title: string;
  tone: keyof typeof TONE;
}) {
  const { box, text, Icon } = TONE[tone];
  return (
    <section className={`flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${box}`}>
      <div className="flex min-w-0 items-start gap-3">
        <Icon aria-hidden="true" className={`mt-0.5 shrink-0 ${text}`} size={18} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{title}</p>
          <p className={`mt-0.5 text-sm ${text}`}>{detail}</p>
        </div>
      </div>
      {action}
    </section>
  );
}

function TopUpLink({ deficitMinor, currency }: { deficitMinor: number; currency: string }) {
  return (
    <Link
      className="inline-flex h-8 shrink-0 items-center self-start rounded-md bg-brand-600 px-3 text-sm font-medium text-white transition hover:bg-brand-700 sm:self-auto"
      href="/vendor/payments/top-up"
    >
      Top up {formatMoneyMinor(deficitMinor, currency)}
    </Link>
  );
}

/** Renders nothing while the wallet is in good standing. Staff see the alert without the top-up button. */
export function VendorWalletStatusBanner({ overview }: { overview: PayoutOverview }) {
  const { overdraft, suspension, walletCurrency } = overview;
  const topUp = overview.canTopUp && overdraft
    ? <TopUpLink currency={walletCurrency} deficitMinor={overdraft.deficitMinor} />
    : undefined;

  if (suspension) {
    const overdraftSuspension = suspension.code === "OVERDRAFT";
    return (
      <Alert
        action={topUp}
        detail={
          overdraftSuspension
            ? "Sales, refunds and payouts are paused. Top up to restore payments and refunds."
            : suspension.reason ?? "Contact the university to restore wallet payments."
        }
        title={
          overdraftSuspension && overdraft
            ? `Payments suspended — wallet overdrawn by ${formatMoneyMinor(overdraft.deficitMinor, walletCurrency)}`
            : "Payments suspended"
        }
        tone="danger"
      />
    );
  }

  if (!overdraft) return null;

  return (
    <Alert
      action={topUp}
      detail={`Payouts are paused and new sales reduce the deficit. Payments will be suspended on ${dateFormatter.format(new Date(overdraft.suspendAt))} unless your balance recovers.`}
      title={`Wallet overdrawn by ${formatMoneyMinor(overdraft.deficitMinor, walletCurrency)}`}
      tone="warning"
    />
  );
}
