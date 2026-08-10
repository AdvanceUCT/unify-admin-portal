/**
 * @fileoverview Renders roster-import audit records and their recorded outcomes.
 * @module features/audit/StudentImportAuditLogTable
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { StatusText } from "@/components/ui/StatusText";
import type { StudentImportAuditLogEntry } from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters";

type StudentImportAuditLogTableProps = {
  logs: StudentImportAuditLogEntry[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function importAuditPageHref(page: number) {
  return `/audit?tab=imports&importPage=${page}`;
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

export function StudentImportAuditLogTable({
  logs,
  page,
  pageSize,
  totalCount,
  totalPages,
}: StudentImportAuditLogTableProps) {
  const firstRow = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Import logs</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-body">
            <thead className="border-b border-border">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-5 py-3 font-medium">Filename</th>
                <th className="px-5 py-3 font-medium">New</th>
                <th className="px-5 py-3 font-medium">Updated</th>
                <th className="px-5 py-3 font-medium">Unchanged</th>
                <th className="px-5 py-3 font-medium">Missing</th>
                <th className="px-5 py-3 font-medium">Errors</th>
                <th className="px-5 py-3 font-medium">Imported by</th>
                <th className="px-5 py-3 font-medium">Imported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-fg-subtle" colSpan={8}>
                    No student import logs found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr className="transition hover:bg-surface-muted/60" key={log.id}>
                    <td className="whitespace-nowrap px-5 py-4 font-medium tabular-nums text-fg">
                      {log.filename ?? "—"}
                    </td>
                    <td className="px-5 py-4 tabular-nums">
                      <StatusText tone="success">{log.newCount}</StatusText>
                    </td>
                    <td className="px-5 py-4 tabular-nums">
                      <StatusText tone="version">{log.updatedCount}</StatusText>
                    </td>
                    <td className="px-5 py-4 tabular-nums">
                      <StatusText tone="neutral">{log.unchangedCount}</StatusText>
                    </td>
                    <td className="px-5 py-4 tabular-nums">
                      <StatusText tone="warning">{log.missingCount}</StatusText>
                    </td>
                    <td className="px-5 py-4 tabular-nums">
                      <StatusText tone="danger">{log.errorCount}</StatusText>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-fg-muted">
                      {log.actorName ?? (log.actorId ? "Unknown admin" : "System")}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-fg-muted">
                      {formatDateTime(log.createdAt)}
                    </td>
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
          <PaginationLink disabled={page === 1} href={importAuditPageHref(page - 1)}>
            <ChevronLeft aria-hidden className="size-4" />
            Previous
          </PaginationLink>
          <span className="text-xs text-fg-subtle">
            Page {page} of {totalPages}
          </span>
          <PaginationLink disabled={page === totalPages} href={importAuditPageHref(page + 1)}>
            Next
            <ChevronRight aria-hidden className="size-4" />
          </PaginationLink>
        </div>
      </div>
    </div>
  );
}
