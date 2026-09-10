/**
 * @fileoverview Renders the authenticated administrator page at `/vendors/invoices/[invoiceId]`.
 * @module app/(admin)/vendors/invoices/[invoiceId]/page
 */

import { notFound } from "next/navigation";

import { BackButton } from "@/components/ui/BackButton";
import { StatusText, type StatusTone } from "@/components/ui/StatusText";
import { assertCan } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { getAdminInvoiceDetail } from "@/lib/billing/invoiceQueries";
import { getApprovedApplicationIdForVendorProfile } from "@/lib/vendors/applications";

import { reconcileInvoicePaymentAction } from "./actions";

const PAYMENT_TONE: Record<string, StatusTone> = {
  UNPAID: "warning",
  PAID: "success",
  NO_PAYMENT_REQUIRED: "neutral",
};

const UNRESOLVED_ATTEMPT_STATUSES = new Set(["READY", "PENDING", "UNKNOWN"]);

export default async function AdminVendorInvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const session = await requireRole(["SUPER_ADMIN", "ADMIN"]);
  assertCan("invoice:read", session);
  assertCan("invoice:reconcile", session);

  const { invoiceId } = await params;
  const detail = await getAdminInvoiceDetail(invoiceId);
  if (!detail) notFound();

  const { document } = detail;
  const canReconcile = detail.paymentStatus === "UNPAID" && detail.attempts.some((attempt) => UNRESOLVED_ATTEMPT_STATUSES.has(attempt.status));
  const reconcileAction = reconcileInvoicePaymentAction.bind(null, invoiceId);
  const applicationId = await getApprovedApplicationIdForVendorProfile(detail.vendorProfileId);
  const backHref = applicationId ? `/vendors/${applicationId}/verification-history` : "/vendors";
  const backLabel = applicationId ? "Back to verification history" : "Back to vendors";

  return (
    <div className="space-y-6">
      <BackButton href={backHref} label={backLabel} />
      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-section-title text-fg">Invoice {document.invoiceNumber}</h2>
            <p className="text-sm text-fg-muted">
              {detail.vendorCompanyName} · {document.periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusText tone={PAYMENT_TONE[detail.paymentStatus] ?? "neutral"}>
              {detail.paymentStatus.replaceAll("_", " ")}
            </StatusText>
            {canReconcile && (
              <form action={reconcileAction}>
                <button
                  className="h-9 rounded-md border border-border px-3 text-sm font-medium text-fg hover:bg-surface-muted"
                  type="submit"
                >
                  Reconcile
                </button>
              </form>
            )}
          </div>
        </div>

        {detail.hasUnresolvedException && (
          <div className="border-b border-border bg-danger-fg/10 px-5 py-3 text-sm text-danger-fg">
            This invoice has an unresolved billing exception under review.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-body">
            <thead className="border-b border-border bg-surface-muted/60">
              <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Service period</th>
                <th className="px-4 py-3 font-medium">Qty</th>
                <th className="px-4 py-3 font-medium">Unit price</th>
                <th className="px-4 py-3 font-medium">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {document.items.map((item, index) => (
                <tr className="align-middle" key={index}>
                  <td className="px-4 py-3 font-medium text-fg">{item.branchName}</td>
                  <td className="px-4 py-3 text-fg-muted">{item.servicePeriodLabel}</td>
                  <td className="px-4 py-3 text-fg-muted">{item.quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-fg-muted">
                    {document.currency} {item.unitPriceDisplay}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-fg">
                    {document.currency} {item.lineTotalDisplay}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-1 border-b border-border px-5 py-4 text-right text-sm">
          <p className="text-fg-muted">
            University share: {document.currency} {document.universityShareDisplay}
          </p>
          <p className="text-fg-muted">
            Platform share: {document.currency} {document.platformShareDisplay}
          </p>
          <p className="text-base font-semibold text-fg">
            Total: {document.currency} {document.totalDisplay}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <h3 className="border-b border-border px-5 py-3 text-sm font-medium text-fg">Payment attempts</h3>
        {detail.attempts.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-subtle">No payment attempts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-body">
              <thead className="border-b border-border bg-surface-muted/60">
                <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Provider txn</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {detail.attempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td className="px-4 py-3 font-mono text-xs text-fg-muted">{attempt.reference}</td>
                    <td className="px-4 py-3 text-fg-muted">{attempt.status}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-fg">
                      {document.currency} {attempt.expectedAmountDisplay}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{attempt.providerTransactionId ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{attempt.updatedAtIso.slice(0, 19).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail.payments.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <h3 className="border-b border-border px-5 py-3 text-sm font-medium text-fg">Payments</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-body">
              <thead className="border-b border-border bg-surface-muted/60">
                <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                  <th className="px-4 py-3 font-medium">Provider txn</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Paid at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {detail.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 text-fg-muted">{payment.providerTransactionId}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-fg">
                      {document.currency} {payment.grossAmountDisplay}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{payment.paidAtIso.slice(0, 19).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {detail.exceptions.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <h3 className="border-b border-border px-5 py-3 text-sm font-medium text-fg">Billing exceptions</h3>
          <ul className="divide-y divide-border">
            {detail.exceptions.map((exception) => (
              <li className="px-5 py-3" key={exception.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-fg">{exception.type}</span>
                  <StatusText tone={exception.resolved ? "success" : "warning"}>{exception.resolved ? "Resolved" : "Open"}</StatusText>
                </div>
                <p className="mt-1 text-xs text-fg-subtle">{exception.createdAtIso.slice(0, 19).replace("T", " ")}</p>
                <pre className="mt-2 overflow-x-auto rounded-md bg-surface-muted/60 p-2 text-xs text-fg-muted">
                  {JSON.stringify(exception.details, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
