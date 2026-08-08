import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { StatusText } from "@/components/ui/StatusText";
import type { CredentialAuditLogEntry } from "@/lib/api/types";
import { credentialAuditActionTone, formatCredentialAuditAction, formatDateTime } from "@/lib/formatters";

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

function triggeredByLabel(log: CredentialAuditLogEntry) {
  if (!log.actorId) return "System";
  return log.actorName ?? "Unknown admin";
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
    "inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg";

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
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Credential logs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-body">
            <thead className="border-b border-border">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Triggered by</th>
                <th className="px-5 py-3 font-medium">Student ID</th>
                <th className="px-5 py-3 font-medium">Schema version</th>
                <th className="px-5 py-3 font-medium">Batch</th>
                <th className="px-5 py-3 font-medium">Occurred</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-fg-subtle" colSpan={6}>
                    No credential logs found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr className="transition hover:bg-surface-muted/60" key={log.id}>
                    <td className="px-5 py-4">
                      <StatusText tone={credentialAuditActionTone(log.action)}>
                        {formatCredentialAuditAction(log.action)}
                      </StatusText>
                    </td>
                    <td className="px-5 py-4 text-fg-muted">{triggeredByLabel(log)}</td>
                    <td className="px-5 py-4 font-medium tabular-nums text-fg">{log.studentId}</td>
                    <td className="px-5 py-4 tabular-nums">
                      {log.schemaVersion ? (
                        <span className="font-semibold text-info-fg">v{log.schemaVersion}</span>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-fg-muted">{log.batchId ?? "Individual"}</td>
                    <td className="px-5 py-4 text-fg-muted">{formatDateTime(log.occurredAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-fg-subtle">
          Showing {firstRow}-{lastRow} of {totalCount} logs
        </p>
        <div className="flex items-center gap-2">
          <PaginationLink disabled={page === 1} href={auditPageHref(page - 1)}>
            <ChevronLeft aria-hidden className="size-4" />
            Previous
          </PaginationLink>
          <span className="text-xs text-fg-subtle">
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
