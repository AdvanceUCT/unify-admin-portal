import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import type { CredentialAuditLogEntry } from "@/lib/api/types";
import { formatActivationDeliveryStatus, formatDateTime } from "@/lib/formatters";

type CredentialAuditLogTableProps = {
  logs: CredentialAuditLogEntry[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function auditPageHref(page: number) {
  return `/audit?credentialPage=${page}`;
}

function PaginationLink({
  children,
  disabled,
  href,
}: {
  children: ReactNode;
  disabled: boolean;
  href: string;
}) {
  const className =
    "inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50";

  if (disabled) {
    return (
      <span className={`${className} cursor-not-allowed opacity-50`} aria-disabled="true">
        {children}
      </span>
    );
  }

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

export function CredentialAuditLogTable({ logs, page, pageSize, totalCount, totalPages }: CredentialAuditLogTableProps) {
  const firstRow = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">Credential logs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Actor ID</th>
                <th className="px-5 py-3 font-medium">Student ID</th>
                <th className="px-5 py-3 font-medium">Delivery</th>
                <th className="px-5 py-3 font-medium">Batch</th>
                <th className="px-5 py-3 font-medium">Occurred</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {logs.length === 0 ? (
                <tr>
                  <td className="px-5 py-12 text-center text-sm text-zinc-500" colSpan={6}>
                    No credential offer logs found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-5 py-4 font-medium text-zinc-950">Offer sent</td>
                    <td className="px-5 py-4 font-mono text-xs text-zinc-600">{log.actorId ?? "System"}</td>
                    <td className="px-5 py-4 font-medium text-zinc-900">{log.studentId}</td>
                    <td className="px-5 py-4">
                      {log.deliveryStatus ? (
                        <Badge tone={log.deliveryStatus === "Delivered" ? "success" : "danger"}>
                          {formatActivationDeliveryStatus(log.deliveryStatus)}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">{log.batchId ?? "Individual"}</td>
                    <td className="px-5 py-4 text-zinc-600">{formatDateTime(log.occurredAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          Showing {firstRow}-{lastRow} of {totalCount} logs
        </p>
        <div className="flex items-center gap-2">
          <PaginationLink disabled={page === 1} href={auditPageHref(page - 1)}>
            <ChevronLeft aria-hidden className="size-4" />
            Previous
          </PaginationLink>
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <PaginationLink disabled={page === totalPages} href={auditPageHref(page + 1)}>
            Next
            <ChevronRight aria-hidden className="size-4" />
          </PaginationLink>
        </div>
      </div>
    </div>
  );
}
