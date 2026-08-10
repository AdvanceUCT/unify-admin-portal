/**
 * @fileoverview Lists a vendor's previous applications and decisions.
 * @module features/vendors/VendorApplicationHistory
 */

import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/formatters";

type HistoryApplication = {
  id: string;
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "REVOKED";
  createdAt: Date;
  reviewedAt: Date | null;
  revokedAt: Date | null;
  snapshotCompanyName: string | null;
  vendorProfile: { companyName: string };
};

function statusTone(status: HistoryApplication["status"]) {
  if (status === "APPROVED") return "success" as const;
  if (status === "PENDING") return "warning" as const;
  if (status === "DRAFT") return "neutral" as const;
  return "danger" as const;
}

export function VendorApplicationHistory({ applications }: { applications: HistoryApplication[] }) {
  if (applications.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-section-title text-fg">Previous applications</h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          A record of your past verifier application submissions.
        </p>
      </div>
      <div className="divide-y divide-border">
        {applications.map((application) => {
          const decidedAt = application.revokedAt ?? application.reviewedAt;
          return (
            <div
              key={application.id}
              className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-fg">
                  {application.snapshotCompanyName ?? application.vendorProfile.companyName}
                </p>
                <p className="mt-0.5 text-xs text-fg-subtle">
                  Submitted {formatDateTime(application.createdAt.toISOString())}
                  {decidedAt ? ` · Decided ${formatDateTime(decidedAt.toISOString())}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={statusTone(application.status)}>{application.status}</Badge>
                <Link
                  className="text-sm font-medium text-fg-muted underline underline-offset-2 hover:text-fg"
                  href={`/vendor/application/history/${application.id}`}
                >
                  View
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
