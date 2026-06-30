import { CheckCircle2, Mail, QrCode, ShieldCheck, SmartphoneNfc, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Metric } from "@/components/ui/Metric";
import { formatDateTime } from "@/lib/formatters";
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
    description: "They review the request and choose whether to share their faculty, enrollment status, and student number.",
    icon: UserCheck,
  },
  {
    title: "You see the result here",
    description: "Once they respond, the outcome appears in your verification history below — no paperwork.",
    icon: ShieldCheck,
  },
];

function maskStudentNumber(studentNumber: string | null) {
  if (!studentNumber) return "Student";
  const visible = studentNumber.slice(-4);
  return `•••• ${visible}`;
}

export function VendorVerificationOverview({
  companyName,
  stats,
  recentVerifications,
}: {
  companyName: string;
  stats: Awaited<ReturnType<typeof getVendorVerificationStats>>;
  recentVerifications: Awaited<ReturnType<typeof listRecentVendorVerifications>>;
}) {
  const approvalRate = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={20} aria-hidden="true" />
        <div>
          <p className="font-medium text-emerald-900">Access verification services</p>
          <p className="mt-1 text-sm text-emerald-700">
            {companyName} is verified and approved to use UNIFY verification services.
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
        <section className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
          <span className="grid size-16 place-items-center rounded-md bg-zinc-100 text-zinc-400">
            <QrCode size={32} aria-hidden="true" />
          </span>
          <p className="font-medium text-zinc-950">QR verification is coming soon</p>
          <p className="max-w-xs text-sm text-zinc-500">
            Once enabled, you&apos;ll display this code at your service point so students can verify in seconds.
          </p>
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

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="font-medium text-zinc-950">Recent verifications</h2>
        </div>
        <div className="divide-y divide-zinc-100">
          {recentVerifications.map((verification) => (
            <div className="flex items-center justify-between gap-4 px-5 py-3" key={verification.id}>
              <div>
                <p className="text-sm font-medium text-zinc-900">{maskStudentNumber(verification.studentNumber)}</p>
                <p className="text-xs text-zinc-500">{verification.faculty ?? "Faculty not shared"}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-400">{formatDateTime(verification.createdAt.toISOString())}</span>
                <Badge tone={STATUS_TONE[verification.status]}>{verification.status}</Badge>
              </div>
            </div>
          ))}
          {recentVerifications.length === 0 && (
            <p className="px-5 py-6 text-sm text-zinc-500">
              No verifications yet — once students start verifying with your QR code, they&apos;ll show up here.
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
          <p className="text-sm text-zinc-500">
            Contact{" "}
            <a className="font-medium text-zinc-700 underline" href="mailto:support@unify.app">
              support@unify.app
            </a>{" "}
            if you have any questions about verification services.
          </p>
        </div>
      </section>
    </div>
  );
}
