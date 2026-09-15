/**
 * @fileoverview Shared vendor and payment decision log tables.
 * @module features/audit/DecisionLogTables
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { StatusText } from "@/components/ui/StatusText";
import { DecisionNoteButton } from "@/features/audit/DecisionNoteButton";

function decisionDate(value: Date | string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
      <span aria-disabled="true" className={`${className} cursor-not-allowed opacity-50`}>
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

function DecisionPagination({
  hrefForPage,
  page,
  pageSize,
  totalCount,
  totalPages,
}: {
  hrefForPage: (page: number) => string;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}) {
  const firstRow = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-fg-subtle">
        Showing {firstRow}-{lastRow} of {totalCount} decisions
      </p>
      <div className="flex items-center gap-2">
        <PaginationLink disabled={page === 1} href={hrefForPage(page - 1)}>
          <ChevronLeft aria-hidden className="size-4" />
          Previous
        </PaginationLink>
        <span className="text-xs text-fg-subtle">
          Page {page} of {totalPages}
        </span>
        <PaginationLink disabled={page === totalPages} href={hrefForPage(page + 1)}>
          Next
          <ChevronRight aria-hidden className="size-4" />
        </PaginationLink>
      </div>
    </div>
  );
}

export function VendorApplicationDecisionTable({
  decisions,
  hrefForPage,
  page,
  pageSize,
  totalCount,
  totalPages,
}: {
  decisions: Array<{
    companyName: string;
    companyRegistrationNumber: string | null;
    createdAt: Date;
    decisionActorName: string | null;
    decisionAt: Date | null;
    decisionNotes: string | null;
    id: string;
    serviceCategory: string;
    status: string;
  }>;
  hrefForPage: (page: number) => string;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}) {
  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Vendor application decisions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-body">
            <thead className="border-b border-border">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium">Decision</th>
                <th className="px-5 py-3 font-medium">Decided by</th>
                <th className="px-5 py-3 font-medium">Notes</th>
                <th className="px-5 py-3 font-medium">Decided</th>
                <th className="px-5 py-3 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {decisions.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-fg-subtle" colSpan={7}>
                    No vendor application decisions have been made yet.
                  </td>
                </tr>
              ) : (
                decisions.map((application) => (
                  <tr className="transition hover:bg-surface-muted/60" key={application.id}>
                    <td className="px-5 py-4">
                      <div className="font-medium text-fg">{application.companyName}</div>
                      {application.companyRegistrationNumber ? (
                        <div className="text-xs text-fg-subtle">
                          Reg. {application.companyRegistrationNumber}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-fg-muted">{application.serviceCategory}</td>
                    <td className="px-5 py-4">
                      {application.status === "APPROVED" ? (
                        <StatusText tone="success">Approved</StatusText>
                      ) : application.status === "REVOKED" ? (
                        <StatusText tone="warning">Revoked</StatusText>
                      ) : (
                        <StatusText tone="danger">Rejected</StatusText>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-fg-muted">
                      {application.decisionActorName ?? <span className="text-fg-subtle">Unknown</span>}
                    </td>
                    <td className="px-5 py-4">
                      {application.decisionNotes ? (
                        <DecisionNoteButton companyName={application.companyName} note={application.decisionNotes} />
                      ) : (
                        <span className="text-fg-subtle">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums text-fg-muted">
                      {application.decisionAt ? decisionDate(application.decisionAt) : <span className="text-fg-subtle">-</span>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums text-fg-muted">
                      {decisionDate(application.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <DecisionPagination
        hrefForPage={hrefForPage}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        totalPages={totalPages}
      />
    </div>
  );
}

export function PaymentAccessDecisionTable({
  decisions,
  hrefForPage,
  page,
  pageSize,
  totalCount,
  totalPages,
}: {
  decisions: Array<{
    branchName: string;
    companyName: string;
    decisionActorName: string | null;
    decisionAt: Date | null;
    decisionNotes: string | null;
    id: string;
    serviceCategory: string;
    status: string;
    submittedAt: Date;
  }>;
  hrefForPage: (page: number) => string;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}) {
  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Payment access decisions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-body">
            <thead className="border-b border-border">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-5 py-3 font-medium">Vendor</th>
                <th className="px-5 py-3 font-medium">Branch</th>
                <th className="px-5 py-3 font-medium">Decision</th>
                <th className="px-5 py-3 font-medium">Decided by</th>
                <th className="px-5 py-3 font-medium">Notes</th>
                <th className="px-5 py-3 font-medium">Decided</th>
                <th className="px-5 py-3 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {decisions.length === 0 ? (
                <tr>
                  <td className="px-5 py-10 text-fg-subtle" colSpan={7}>
                    No payment access decisions have been made yet.
                  </td>
                </tr>
              ) : (
                decisions.map((decision) => (
                  <tr className="transition hover:bg-surface-muted/60" key={decision.id}>
                    <td className="px-5 py-4">
                      <div className="font-medium text-fg">{decision.companyName}</div>
                      <div className="text-xs text-fg-subtle">{decision.serviceCategory}</div>
                    </td>
                    <td className="px-5 py-4 text-fg-muted">{decision.branchName}</td>
                    <td className="px-5 py-4">
                      {decision.status === "APPROVED" ? (
                        <StatusText tone="success">Approved</StatusText>
                      ) : decision.status === "REVOKED" ? (
                        <StatusText tone="warning">Revoked</StatusText>
                      ) : (
                        <StatusText tone="danger">Denied</StatusText>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-fg-muted">
                      {decision.decisionActorName ?? <span className="text-fg-subtle">Unknown</span>}
                    </td>
                    <td className="px-5 py-4">
                      {decision.decisionNotes ? (
                        <DecisionNoteButton companyName={decision.companyName} note={decision.decisionNotes} />
                      ) : (
                        <span className="text-fg-subtle">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums text-fg-muted">
                      {decision.decisionAt ? decisionDate(decision.decisionAt) : <span className="text-fg-subtle">-</span>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums text-fg-muted">
                      {decisionDate(decision.submittedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <DecisionPagination
        hrefForPage={hrefForPage}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        totalPages={totalPages}
      />
    </div>
  );
}
