import QRCode from "qrcode";
import { CheckCircle2, Mail, QrCode, ShieldCheck, SmartphoneNfc, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { CopyButton, QrCodeActions } from "@/features/vendors/QrCodeActions";
import { Metric } from "@/components/ui/Metric";
import { formatDateTime } from "@/lib/formatters";
import { parseVerificationAttributes } from "@/lib/vendors/verificationContract";
import type { getVendorVerificationStats, listRecentVendorVerifications } from "@/lib/vendors/verifications";

const STATUS_TONE = {
  PENDING: "warning",
  APPROVED: "success",
  DECLINED: "danger",
  EXPIRED: "danger",
  FAILED: "danger",
} as const;

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
    description: "Once they respond, the verified result and disclosed values appear in your history.",
    icon: ShieldCheck,
  },
];

export async function VendorVerificationOverview({
  companyName,
  verificationUrl,
  stats,
  recentVerifications,
  supportEmail,
}: {
  companyName: string;
  verificationUrl: string | null;
  stats: Awaited<ReturnType<typeof getVendorVerificationStats>>;
  recentVerifications: Awaited<ReturnType<typeof listRecentVendorVerifications>>;
  supportEmail?: string;
}) {
  const approvalRate = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : null;
  const qrSvg = verificationUrl
    ? await QRCode.toString(verificationUrl, { type: "svg", margin: 1 })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={20} aria-hidden="true" />
        <div>
          <p className="font-medium text-emerald-900">Verifier application approved</p>
          <p className="mt-1 text-sm text-emerald-700">
            {verificationUrl
              ? `${companyName} is approved and ready to verify student credentials.`
              : `${companyName} is approved. Your verification QR code will appear here once service setup is complete.`}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total verifications" value={stats.total} detail="All time" />
        <Metric
          label="Approved"
          value={stats.approved}
          detail={approvalRate !== null ? `${approvalRate}% approval rate` : "No verifications yet"}
        />
        <Metric label="Pending" value={stats.pending} detail="Awaiting student response" />
        <Metric label="This month" value={stats.thisMonth} detail="Verifications since the 1st" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex flex-col items-center justify-center gap-4 rounded-lg border border-zinc-200 bg-white p-8 text-center">
          {qrSvg ? (
            <>
              <div
                className="size-48"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
                aria-label="Verification QR code"
              />
              <div>
                <p className="font-medium text-zinc-950">Your verification QR code</p>
                <p className="mt-1 max-w-xs text-sm text-zinc-500">
                  Display this at your service point so students can scan and verify instantly.
                </p>
              </div>
              <QrCodeActions svg={qrSvg} filename={`${companyName.toLowerCase().replace(/\s+/g, "-")}-qr`} />
            </>
          ) : (
            <>
              <span className="grid size-16 place-items-center rounded-md bg-zinc-100 text-zinc-400">
                <QrCode size={32} aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium text-zinc-950">QR code is being set up</p>
                <p className="mt-1 max-w-xs text-sm text-zinc-500">
                  Your QR code will appear here shortly. Refresh the page in a moment.
                </p>
              </div>
            </>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="font-medium text-zinc-950">How verification works</h2>
          <ol className="mt-4 space-y-4">
            {HOW_IT_WORKS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li className="flex gap-3" key={step.title}>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-900">
                      <Icon className="text-zinc-400" size={14} aria-hidden="true" />
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-500">{step.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      {verificationUrl && (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="font-medium text-zinc-950">Verification link</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Share this link directly for online or remote verifications where a QR code isn&apos;t practical.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
            <a
              href={verificationUrl}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-sm text-blue-600 hover:underline"
            >
              {verificationUrl}
            </a>
            <CopyButton value={verificationUrl} />
          </div>
        </section>
      )}

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="font-medium text-zinc-950">Recent verifications</h2>
        </div>
        <div className="divide-y divide-zinc-100">
          {recentVerifications.map((verification) => {
            const attributes = Object.entries(parseVerificationAttributes(verification.attributes));

            return (
              <div className="space-y-3 px-5 py-4" key={verification.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {verification.servicePointName ?? "Student verification"}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatDateTime(verification.createdAt.toISOString())}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[verification.status]}>{verification.status}</Badge>
                </div>
                {attributes.length > 0 ? (
                  <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {attributes.map(([name, value]) => (
                      <div className="rounded-md bg-zinc-50 px-3 py-2" key={name}>
                        <dt className="text-xs font-medium text-zinc-500">{name}</dt>
                        <dd className="mt-0.5 break-words text-sm text-zinc-900">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            );
          })}
          {recentVerifications.length === 0 && (
            <p className="px-5 py-6 text-sm text-zinc-500">
              No verifications yet. Results will appear here once students start using your QR code.
            </p>
          )}
        </div>
      </section>

      <section className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-500">
          <Mail size={18} aria-hidden="true" />
        </span>
        <div>
          <p className="font-medium text-zinc-950">Need help?</p>
          {supportEmail ? (
            <p className="text-sm text-zinc-500">
              Contact{" "}
              <a className="font-medium text-zinc-700 underline" href={`mailto:${supportEmail}`}>
                {supportEmail}
              </a>{" "}
              if you have any questions about verification services.
            </p>
          ) : (
            <p className="text-sm text-zinc-500">Contact your university administrator for verification support.</p>
          )}
        </div>
      </section>
    </div>
  );
}
