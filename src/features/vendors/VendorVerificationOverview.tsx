import QRCode from "qrcode";
import Link from "next/link";
import { QrCode, ShieldCheck, SmartphoneNfc, UserCheck } from "lucide-react";

import { ApprovedBanner } from "@/features/vendors/ApprovedBanner";
import { CopyButton, QrCodeActions } from "@/features/vendors/QrCodeActions";
import { LiveVerificationList } from "@/features/vendors/LiveVerificationList";
import { Metric } from "@/components/ui/Metric";
import type { getVendorVerificationStats, listRecentVendorVerifications } from "@/lib/vendors/verifications";
import {
  normalizedVerificationAttributes,
  summarizeVerificationStudent,
  vendorVerificationFailureReason,
} from "@/lib/vendors/verificationContract";

const HOW_IT_WORKS = [
  {
    title: "Student scans your QR code",
    description: "They scan it using the UNIFY wallet app at your service point.",
    icon: SmartphoneNfc,
  },
  {
    title: "Student grants or denies access",
    description: "They review every attribute in the active student credential schema and approve or deny the complete request.",
    icon: UserCheck,
  },
  {
    title: "You see the result here",
    description: "Once they respond, the approved or declined result appears in your history.",
    icon: ShieldCheck,
  },
];

export async function VendorVerificationOverview({
  companyName,
  vendorId,
  verificationUrl,
  stats,
  recentVerifications,
  liveCursor,
  viewAllHref = "/vendor/verifications",
}: {
  companyName: string;
  vendorId: string;
  verificationUrl: string | null;
  stats: Awaited<ReturnType<typeof getVendorVerificationStats>>;
  recentVerifications: Awaited<ReturnType<typeof listRecentVendorVerifications>>;
  liveCursor?: string;
  viewAllHref?: string;
}) {
  const approvalRate = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : null;
  const qrSvg = verificationUrl
    ? await QRCode.toString(verificationUrl, { type: "svg", margin: 1 })
    : null;

  return (
    <div className="space-y-6">
      <ApprovedBanner
        message={
          verificationUrl
            ? `${companyName} is approved and ready to verify student credentials.`
            : `${companyName} is approved. Your verification QR code will appear here once service setup is complete.`
        }
        vendorId={vendorId}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total verifications" value={stats.total} detail="All time" tone="brand" />
        <Metric
          label="Approved"
          value={stats.approved}
          detail={approvalRate !== null ? `${approvalRate}% approval rate` : "No verifications yet"}
          tone="success"
        />
        <Metric label="Pending" value={stats.pending} detail="Awaiting student response" tone="warning" />
        <Metric label="This month" value={stats.thisMonth} detail="Verifications since the 1st" tone="info" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface p-8 text-center shadow-md">
          {qrSvg ? (
            <>
              <div
                className="size-48"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
                aria-label="Verification QR code"
              />
              <div>
                <p className="font-medium text-fg">Your verification QR code</p>
                <p className="mt-1 max-w-xs text-sm text-fg-muted">
                  Display this at your service point so students can scan and verify instantly.
                </p>
              </div>
              <QrCodeActions svg={qrSvg} filename={`${companyName.toLowerCase().replace(/\s+/g, "-")}-qr`} />
            </>
          ) : (
            <>
              <span className="grid size-16 place-items-center rounded-md bg-surface-muted text-fg-subtle">
                <QrCode size={32} aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium text-fg">QR code is being set up</p>
                <p className="mt-1 max-w-xs text-sm text-fg-muted">
                  Your QR code will appear here shortly. Refresh the page in a moment.
                </p>
              </div>
            </>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
          <h2 className="text-section-title text-fg">How verification works</h2>
          <ol className="mt-4 space-y-4">
            {HOW_IT_WORKS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li className="flex gap-3" key={step.title}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
                      <Icon className="text-fg-subtle" size={14} aria-hidden="true" />
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-sm text-fg-muted">{step.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      {verificationUrl && (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
          <h2 className="text-section-title text-fg">Verification link</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Share this link directly for online or remote verifications where a QR code isn&apos;t practical.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-2">
            <a
              href={verificationUrl}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-sm font-medium text-info-fg hover:underline"
            >
              {verificationUrl}
            </a>
            <CopyButton value={verificationUrl} />
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Recent verifications</h2>
          <Link className="text-sm font-medium text-fg-muted hover:text-fg" href={viewAllHref}>View all</Link>
        </div>
        <LiveVerificationList initialItems={recentVerifications.map((verification) => {
          const attributes = normalizedVerificationAttributes(verification.attributes);
          return {
            id: verification.id,
            branchId: verification.branchId,
            verificationRequestId: verification.verificationRequestId,
            checkoutId: verification.checkoutId,
            servicePointName: verification.servicePointName,
            status: verification.status,
            isVerified: verification.isVerified,
            failureCode: verification.failureCode,
            failureReason: vendorVerificationFailureReason(verification.failureCode),
            attributes,
            student: summarizeVerificationStudent(attributes),
            createdAt: verification.createdAt.toISOString(),
            completedAt: verification.completedAt?.toISOString() ?? null,
            latestDeliveryStatus: verification.deliveries[0]?.status ?? null,
          };
        })} liveCursor={liveCursor} />
      </section>
    </div>
  );
}
