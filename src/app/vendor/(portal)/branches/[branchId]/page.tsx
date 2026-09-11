/**
 * @fileoverview Renders the approved vendor page at `/vendor/branches/[branchId]`.
 * @module app/vendor/(portal)/branches/[branchId]/page
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";

import { BackButton } from "@/components/ui/BackButton";
import { Badge } from "@/components/ui/Badge";
import { Metric } from "@/components/ui/Metric";
import { LiveVerificationList } from "@/features/vendors/LiveVerificationList";
import { QrCodeActions } from "@/features/vendors/QrCodeActions";
import { prisma } from "@/lib/db/prisma";
import { formatMoneyMinor } from "@/lib/formatters";
import {
  assertBranchAccess,
  requireApprovedVendorContextForRender,
} from "@/lib/vendors/context";
import { encodeLiveVerificationCursor } from "@/lib/vendors/liveVerifications";
import {
  getVendorVerificationStats,
  listRecentVendorVerifications,
} from "@/lib/vendors/verifications";
import {
  normalizedVerificationAttributes,
  summarizeVerificationStudent,
  vendorVerificationFailureReason,
} from "@/lib/vendors/verificationContract";

import {
  retryBranchProvisioningAction,
  setBranchActiveAction,
  setDefaultBranchAction,
  updateBranchAction,
} from "../actions";

const inputClassName =
  "h-10 rounded-md border border-border bg-surface px-3 text-sm font-normal text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const labelClassName = "grid gap-1 text-sm font-medium text-fg-muted";
const secondaryButtonClassName =
  "h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg";
const metricValueClassName = "text-lg leading-tight break-all sm:text-xl xl:text-2xl";

export default async function VendorBranchPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { context } = await requireApprovedVendorContextForRender();
  const { branchId } = await params;
  assertBranchAccess(context, branchId);
  const branch = await prisma.vendorBranch.findFirst({
    where: { id: branchId, vendorProfileId: context.vendorProfileId },
    include: {
      paymentAcceptance: { select: { qrIdentifier: true, status: true } },
      vendorProfile: {
        select: {
          defaultBranchId: true,
          paymentProfile: { select: { status: true } },
          walletAccount: { select: { status: true, currency: true } },
        },
      },
    },
  });
  if (!branch) notFound();

  const [stats, history] = await Promise.all([
    getVendorVerificationStats(context.vendorProfileId, {
      branchIds: [branch.id],
      inPersonOnly: true,
    }),
    listRecentVendorVerifications(context.vendorProfileId, 5, {
      branchIds: [branch.id],
      inPersonOnly: true,
    }),
  ]);
  const qrSvg = branch.verificationUrl
    ? await QRCode.toString(branch.verificationUrl, { type: "svg", margin: 1 })
    : null;
  const paymentQrUrl = branch.paymentAcceptance?.qrIdentifier
    ? `unifywallet://pay/${branch.paymentAcceptance.qrIdentifier}`
    : null;
  const paymentQrEnabled = Boolean(
    paymentQrUrl &&
      branch.active &&
      branch.status === "ACTIVE" &&
      branch.paymentAcceptance?.status === "ACTIVE" &&
      branch.vendorProfile.paymentProfile?.status === "APPROVED" &&
      branch.vendorProfile.walletAccount?.status === "ACTIVE" &&
      branch.vendorProfile.walletAccount.currency === "ZAR",
  );
  const paymentQrSvg = paymentQrEnabled && paymentQrUrl
    ? await QRCode.toString(paymentQrUrl, { type: "svg", margin: 1 })
    : null;
  const isDefault = branch.vendorProfile.defaultBranchId === branch.id;

  return (
    <div className="space-y-6">
      <BackButton href="/vendor/branches" label="Back to branches" />

      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-page-title text-fg">{branch.name}</h1>
            <p className="mt-1 text-sm text-fg-subtle">
              {branch.address || "Physical verification service point"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              tone={
                branch.status === "ACTIVE"
                  ? "success"
                  : branch.status === "PROVISIONING_FAILED"
                    ? "danger"
                    : "warning"
              }
            >
              {branch.status.replaceAll("_", " ")}
            </Badge>
            {isDefault ? <Badge tone="neutral">Default checkout branch</Badge> : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="This month"
          value={stats.currentMonthTotal}
          detail="Total verifications"
          tone="brand"
          valueClassName={metricValueClassName}
        />
        <Metric
          label="Successful"
          value={stats.currentMonthSuccessful}
          detail="Approved and verified this month"
          tone="success"
          valueClassName={metricValueClassName}
        />
        <Metric
          label="Failed or declined"
          value={stats.currentMonthFailedOrDeclined}
          detail="Failed or declined this month"
          tone="danger"
          valueClassName={metricValueClassName}
        />
        <Metric
          label="Running cost"
          value={formatMoneyMinor(stats.currentMonthRunningCostMinor, stats.currentMonthRunningCostCurrency)}
          detail={`Estimated current-month cost in ${stats.currentMonthRunningCostCurrency}`}
          tone="info"
          valueClassName={metricValueClassName}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface p-6 text-center shadow-md">
          <div>
            <h2 className="text-section-title text-fg">Verification QR</h2>
            <p className="mt-1 text-sm text-fg-subtle">Students scan this to present their credential.</p>
          </div>
          {qrSvg ? (
            <div
              className="size-52"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              aria-label={`${branch.name} verification QR code`}
            />
          ) : (
            <p className="py-20 text-sm text-fg-subtle">
              Service point provisioning is incomplete.
            </p>
          )}
          {qrSvg ? (
            <QrCodeActions
              svg={qrSvg}
              filename={`${branch.name.toLowerCase().replace(/\s+/g, "-")}-qr`}
            />
          ) : null}
          {branch.verificationUrl ? (
            <p className="max-w-full break-all text-xs text-fg-subtle">
              {branch.verificationUrl}
            </p>
          ) : null}
        </section>

        <section className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface p-6 text-center shadow-md">
          <div>
            <h2 className="text-section-title text-fg">Payment QR</h2>
            <p className="mt-1 text-sm text-fg-subtle">Students scan this to pay this branch from their UNIFY wallet.</p>
          </div>
          {paymentQrSvg ? (
            <div
              className="size-52"
              dangerouslySetInnerHTML={{ __html: paymentQrSvg }}
              aria-label={`${branch.name} payment QR code`}
            />
          ) : (
            <p className="py-20 text-sm text-fg-subtle">
              Payment QR unavailable — this branch is not approved for wallet payments.
            </p>
          )}
          {paymentQrSvg ? (
            <QrCodeActions
              svg={paymentQrSvg}
              filename={`${branch.name.toLowerCase().replace(/\s+/g, "-")}-payment-qr`}
            />
          ) : null}
          {paymentQrUrl && paymentQrEnabled ? (
            <p className="max-w-full break-all text-xs text-fg-subtle">
              {paymentQrUrl}
            </p>
          ) : null}
        </section>

        {context.role === "OWNER" ? (
          <section className="space-y-5 rounded-xl border border-border bg-surface p-5 shadow-md">
            <h2 className="text-section-title text-fg">Branch settings</h2>
            <form action={updateBranchAction} className="space-y-3">
              <input name="branchId" type="hidden" value={branch.id} />
              <label className={labelClassName}>
                Name
                <input
                  className={inputClassName}
                  defaultValue={branch.name}
                  name="name"
                  required
                />
              </label>
              <label className={labelClassName}>
                Address
                <input
                  className={inputClassName}
                  defaultValue={branch.address ?? ""}
                  name="address"
                />
              </label>
              <button
                className="h-9 rounded-md bg-brand-600 px-3 text-sm font-medium text-white transition hover:bg-brand-700"
                type="submit"
              >
                Save changes
              </button>
            </form>
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {branch.status === "PROVISIONING_FAILED" ? (
                <form action={retryBranchProvisioningAction}>
                  <input name="branchId" type="hidden" value={branch.id} />
                  <button className={secondaryButtonClassName} type="submit">
                    Retry provisioning
                  </button>
                </form>
              ) : null}
              {!isDefault && branch.status === "ACTIVE" ? (
                <form action={setDefaultBranchAction}>
                  <input name="branchId" type="hidden" value={branch.id} />
                  <button className={secondaryButtonClassName} type="submit">
                    Make default
                  </button>
                </form>
              ) : null}
              {!isDefault && branch.agentServicePointId ? (
                <form action={setBranchActiveAction}>
                  <input name="branchId" type="hidden" value={branch.id} />
                  <input
                    name="active"
                    type="hidden"
                    value={branch.active ? "false" : "true"}
                  />
                  <button className={secondaryButtonClassName} type="submit">
                    {branch.active ? "Disable branch" : "Reactivate branch"}
                  </button>
                </form>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Recent verifications</h2>
          <Link
            className="text-sm font-medium text-fg-muted hover:text-fg"
            href={`/vendor/verifications?branchId=${encodeURIComponent(branch.id)}`}
          >
            View all
          </Link>
        </div>
        <LiveVerificationList
          initialItems={history.map((item) => {
            const attributes = normalizedVerificationAttributes(item.attributes);
            return {
              id: item.id,
              branchId: item.branchId,
              verificationRequestId: item.verificationRequestId,
              checkoutId: item.checkoutId,
              servicePointName: item.servicePointName,
              status: item.status,
              isVerified: item.isVerified,
              failureCode: item.failureCode,
              failureReason: vendorVerificationFailureReason(item.failureCode),
              attributes,
              student: summarizeVerificationStudent(attributes),
              createdAt: item.createdAt.toISOString(),
              completedAt: item.completedAt?.toISOString() ?? null,
              latestDeliveryStatus: item.deliveries[0]?.status ?? null,
            };
          })}
          branchId={branch.id}
          liveCursor={encodeLiveVerificationCursor({
            completedAt: new Date().toISOString(),
            id: "_",
          })}
        />
      </section>
    </div>
  );
}
