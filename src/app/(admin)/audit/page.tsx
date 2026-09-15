/**
 * @fileoverview Renders the authenticated administrator page at `/audit`.
 * @module app/(admin)/audit/page
 */

import { PageTabs } from "@/components/layout/PageTabs";
import { CredentialAuditLogTable } from "@/features/audit/CredentialAuditLogTable";
import {
  PaymentAccessDecisionTable,
  VendorApplicationDecisionTable,
} from "@/features/audit/DecisionLogTables";
import { StudentImportAuditLogTable } from "@/features/audit/StudentImportAuditLogTable";
import { requireRoleForRender } from "@/lib/auth/session";
import { getPaginatedCredentialOfferSentAuditLogs } from "@/lib/credentials/audit";
import { getPaginatedStudentImportAuditLogs } from "@/lib/imports/audit";
import { listPaymentAccessDecisions } from "@/lib/payments/branchOnboarding";
import { listDecidedVendorApplications } from "@/lib/vendors/applications";

const CREDENTIAL_AUDIT_PAGE_SIZE = 25;
const STUDENT_IMPORT_AUDIT_PAGE_SIZE = 25;
const DECISION_PAGE_SIZE = 5;

function parsePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function paginateDecisions<T>(items: T[], page: number, pageSize: number) {
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const normalizedPage = Math.min(page, totalPages);
  const start = (normalizedPage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page: normalizedPage,
    pageSize,
    totalCount,
    totalPages,
  };
}

function auditVendorDecisionHref(vendorPage: number, paymentPage: number) {
  return `/audit?tab=vendors&vendorDecisionPage=${vendorPage}&paymentDecisionPage=${paymentPage}`;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    credentialPage?: string | string[];
    importPage?: string | string[];
    paymentDecisionPage?: string | string[];
    tab?: string;
    vendorDecisionPage?: string | string[];
  }>;
}) {
  await requireRoleForRender(["SUPER_ADMIN", "ADMIN", "VIEWER"]);

  const params = await searchParams;
  const activeTab =
    params.tab === "vendors" ? "vendors" : params.tab === "imports" ? "imports" : "credentials";

  const [credentialLogs, decidedVendorApplications, studentImportLogs, paymentDecisions] = await Promise.all([
    getPaginatedCredentialOfferSentAuditLogs({
      page: parsePage(params.credentialPage),
      pageSize: CREDENTIAL_AUDIT_PAGE_SIZE,
    }),
    listDecidedVendorApplications(),
    getPaginatedStudentImportAuditLogs({
      page: parsePage(params.importPage),
      pageSize: STUDENT_IMPORT_AUDIT_PAGE_SIZE,
    }),
    listPaymentAccessDecisions({
      page: parsePage(params.paymentDecisionPage),
      pageSize: DECISION_PAGE_SIZE,
    }),
  ]);
  const vendorDecisions = paginateDecisions(
    decidedVendorApplications,
    parsePage(params.vendorDecisionPage),
    DECISION_PAGE_SIZE,
  );

  return (
    <div className="space-y-6">
      <PageTabs
        tabs={[
          { href: "/audit", isActive: activeTab === "credentials", label: "Credential logs" },
          {
            href: "/audit?tab=vendors",
            isActive: activeTab === "vendors",
            label: "Vendor decisions",
          },
          { href: "/audit?tab=imports", isActive: activeTab === "imports", label: "Import logs" },
        ]}
      />

      {activeTab === "credentials" && (
        <CredentialAuditLogTable
          logs={credentialLogs.logs}
          page={credentialLogs.page}
          pageSize={credentialLogs.pageSize}
          totalCount={credentialLogs.totalCount}
          totalPages={credentialLogs.totalPages}
        />
      )}

      {activeTab === "vendors" && (
        <div className="space-y-6">
          <VendorApplicationDecisionTable
            decisions={vendorDecisions.items}
            hrefForPage={(page) => auditVendorDecisionHref(page, paymentDecisions.page)}
            page={vendorDecisions.page}
            pageSize={vendorDecisions.pageSize}
            totalCount={vendorDecisions.totalCount}
            totalPages={vendorDecisions.totalPages}
          />
          <PaymentAccessDecisionTable
            decisions={paymentDecisions.decisions}
            hrefForPage={(page) => auditVendorDecisionHref(vendorDecisions.page, page)}
            page={paymentDecisions.page}
            pageSize={paymentDecisions.pageSize}
            totalCount={paymentDecisions.totalCount}
            totalPages={paymentDecisions.totalPages}
          />
        </div>
      )}
      {activeTab === "imports" && (
        <StudentImportAuditLogTable
          logs={studentImportLogs.logs}
          page={studentImportLogs.page}
          pageSize={studentImportLogs.pageSize}
          totalCount={studentImportLogs.totalCount}
          totalPages={studentImportLogs.totalPages}
        />
      )}
    </div>
  );
}
