import Link from "next/link";

import { SectionHeader } from "@/components/layout/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { Metric } from "@/components/ui/Metric";
import { RenewalBatchTrigger } from "@/features/credentials/RenewalBatchTrigger";
import { requireRole } from "@/lib/auth/session";
import {
  previewDueRenewals,
  type RenewalPreviewItem,
  type RenewalPreviewOutcome,
} from "@/lib/credentials/renewal";
import { formatDateTime } from "@/lib/formatters";

const ROLES_ALLOWED_TO_RUN = ["SUPER_ADMIN", "ADMIN", "ISSUER"] as const;

const OUTCOME_TONE: Record<RenewalPreviewOutcome, "success" | "warning" | "neutral"> = {
  FLAGGED: "warning",
  SKIPPED_LIMIT: "neutral",
  WILL_RENEW: "success",
};

const OUTCOME_LABEL: Record<RenewalPreviewOutcome, string> = {
  FLAGGED: "Flagged",
  SKIPPED_LIMIT: "Skipped this run",
  WILL_RENEW: "Will renew",
};

function ReviewRow({ item }: { item: RenewalPreviewItem }) {
  return (
    <tr>
      <td className="px-5 py-4 font-medium text-zinc-900">
        {item.profileId ? (
          <Link className="text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-950" href={`/students/${item.profileId}`}>
            {item.studentId}
          </Link>
        ) : (
          item.studentId
        )}
      </td>
      <td className="px-5 py-4 text-zinc-600">{item.email ?? "—"}</td>
      <td className="px-5 py-4 text-zinc-600">{item.expiresAt ? formatDateTime(item.expiresAt.toISOString()) : "—"}</td>
      <td className="px-5 py-4">
        <Badge tone={OUTCOME_TONE[item.outcome]}>{OUTCOME_LABEL[item.outcome]}</Badge>
      </td>
      <td className="px-5 py-4 text-zinc-600">{item.reason ?? "—"}</td>
    </tr>
  );
}

export default async function RenewalPreviewPage() {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN", "ISSUER", "VIEWER"]);
  const canRun = (ROLES_ALLOWED_TO_RUN as readonly string[]).includes(session.user.role ?? "");

  const preview = await previewDueRenewals();
  const reviewItems = preview.items.filter((item) => item.outcome !== "WILL_RENEW");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader
          title="Next renewal batch preview"
          description="A live, read-only dry run of what the automated renewal job would do right now — nothing below has actually been touched."
        />
        <Link
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition hover:border-zinc-950"
          href="/credentials/issuance/renewals"
        >
          Renewal settings
        </Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Due for renewal" value={preview.totalDue} detail={`as of ${formatDateTime(preview.generatedAt.toISOString())}`} />
        <Metric label="Will renew" value={preview.willRenewCount} detail="no issues detected" />
        <Metric label="Flagged" value={preview.flaggedCount} detail="needs review before running" />
        <Metric
          label="Skipped this run"
          value={preview.skippedByLimitCount}
          detail={`over the ${preview.batchLimit}-credential limit`}
        />
      </section>

      {preview.systemWarning ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{preview.systemWarning}</p>
      ) : null}

      {canRun ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-base font-semibold text-zinc-950">Give the go-ahead</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Reviewed the list below and happy to proceed? This runs the exact same job the nightly cron uses, right now, against
            everything currently due.
          </p>
          <div className="mt-4">
            <RenewalBatchTrigger
              flaggedCount={preview.flaggedCount}
              totalDue={preview.totalDue}
              willRenewCount={preview.willRenewCount}
            />
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">Items needing attention</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Credentials predicted to renew cleanly aren&apos;t listed individually below — only what&apos;s flagged for review or deferred
            past this run&apos;s batch limit.
          </p>
        </div>
        {reviewItems.length === 0 ? (
          <p className="px-5 py-6 text-sm text-zinc-600">Nothing is flagged or deferred right now — the next run should process cleanly.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Student ID</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Expires</th>
                  <th className="px-5 py-3 font-medium">Outcome</th>
                  <th className="px-5 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {reviewItems.map((item) => (
                  <ReviewRow item={item} key={item.issuanceId} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
