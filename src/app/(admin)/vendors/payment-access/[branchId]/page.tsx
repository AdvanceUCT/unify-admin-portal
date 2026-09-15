/**
 * @fileoverview Admin branch payment-access review page.
 * @module app/(admin)/vendors/payment-access/[branchId]/page
 */

import { Check } from "lucide-react";
import { notFound } from "next/navigation";

import { BackButton } from "@/components/ui/BackButton";
import { Badge } from "@/components/ui/Badge";
import { requireRoleForRender } from "@/lib/auth/session";
import {
  PAYMENT_ACCESS_ACKNOWLEDGEMENT_TEXT,
  getBranchPaymentAccessDetail,
} from "@/lib/payments/branchOnboarding";

import {
  approveBranchPaymentApplicationAction,
  rejectBranchPaymentApplicationAction,
  revokeBranchPaymentAcceptanceAction,
} from "../../actions";
import { PaymentAccessRevokeButton } from "../../PaymentAccessRevokeButton";
import { RejectForm } from "../../RejectForm";

function displayDate(value: Date | null) {
  if (!value) return null;
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function detailValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function payoutSnapshotValue(snapshot: unknown, key: string) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  return detailValue((snapshot as Record<string, unknown>)[key]);
}

export default async function BranchPaymentAccessPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  await requireRoleForRender(["SUPER_ADMIN", "ADMIN"]);
  const { branchId } = await params;
  const branch = await getBranchPaymentAccessDetail(branchId);

  if (!branch) notFound();

  const latestApplication = branch.paymentApplications[0] ?? null;
  const pendingApplication = latestApplication?.status === "PENDING" ? latestApplication : null;
  const activeAcceptance = branch.paymentAcceptance?.status === "ACTIVE" ? branch.paymentAcceptance : null;
  const hasPayoutSnapshot = Boolean(latestApplication?.payoutDestinationReferenceSnapshot);
  const hasAcknowledgement = Boolean(latestApplication?.studentDataAcknowledgedAt);
  const canApprovePending =
    Boolean(pendingApplication) &&
    branch.active &&
    branch.status === "ACTIVE" &&
    hasPayoutSnapshot &&
    hasAcknowledgement;

  return (
    <div className="space-y-6">
      <BackButton href="/vendors?tab=payments" label="Back to Payment Access" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-page-title text-fg">{branch.vendorProfile.companyName}</h1>
          <p className="mt-1 text-sm text-fg-subtle">
            {branch.name} &middot; {branch.vendorProfile.serviceCategory}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={branch.active && branch.status === "ACTIVE" ? "success" : "warning"}>
              {branch.active ? branch.status.replaceAll("_", " ") : "Inactive"}
            </Badge>
            {activeAcceptance ? (
              <Badge tone="success">Payment approved</Badge>
            ) : pendingApplication ? (
              <Badge tone="warning">Pending review</Badge>
            ) : latestApplication ? (
              <Badge tone={latestApplication.status === "REJECTED" || latestApplication.status === "REVOKED" ? "danger" : "neutral"}>
                {latestApplication.status.replaceAll("_", " ")}
              </Badge>
            ) : (
              <Badge tone="neutral">Not requested</Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeAcceptance ? (
            <PaymentAccessRevokeButton
              action={revokeBranchPaymentAcceptanceAction}
              branchId={branch.id}
              branchName={branch.name}
              companyName={branch.vendorProfile.companyName}
            />
          ) : null}
          {pendingApplication ? (
            <>
              <form action={approveBranchPaymentApplicationAction}>
                <input name="applicationId" type="hidden" value={pendingApplication.id} />
                <input name="branchId" type="hidden" value={branch.id} />
                <button
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-success-border bg-success-bg px-3 text-sm font-medium text-success-fg transition hover:bg-success-border disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canApprovePending}
                  type="submit"
                >
                  <Check aria-hidden className="size-4" />
                  Approve
                </button>
              </form>
              <RejectForm
                action={rejectBranchPaymentApplicationAction}
                applicationId={pendingApplication.id}
                confirmLabel="Confirm denial"
                hiddenFields={{ branchId: branch.id }}
                label="Deny"
                reasonLabel="Reason for denial"
                title="Deny payment access"
              />
            </>
          ) : null}
        </div>
      </div>

      {pendingApplication && !canApprovePending ? (
        <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-fg">
          The branch must be active and the request must include a payout destination and acknowledgement before approval.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Application details</h2>
        </div>
        <div className="grid gap-4 p-5 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface-muted/60 p-4">
            <h3 className="text-sm font-semibold text-fg">Service point</h3>
            <dl className="mt-3 grid gap-3 text-sm text-fg-muted">
              <div>
                <dt className="font-medium text-fg">Branch</dt>
                <dd>{branch.name}</dd>
              </div>
              <div>
                <dt className="font-medium text-fg">Location</dt>
                <dd>{branch.address || "No branch location supplied"}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-surface-muted/60 p-4">
            <h3 className="text-sm font-semibold text-fg">Payout destination</h3>
            <dl className="mt-3 grid gap-3 text-sm text-fg-muted">
              <div>
                <dt className="font-medium text-fg">Provider</dt>
                <dd>{latestApplication?.payoutProviderSnapshot ?? "Not supplied"}</dd>
              </div>
              <div>
                <dt className="font-medium text-fg">Reference</dt>
                <dd className="break-all">{latestApplication?.payoutDestinationReferenceSnapshot ?? "Not supplied"}</dd>
              </div>
              <div>
                <dt className="font-medium text-fg">Account holder</dt>
                <dd>
                  {payoutSnapshotValue(latestApplication?.payoutDestinationSnapshot, "accountHolderName") ??
                    payoutSnapshotValue(latestApplication?.payoutDestinationSnapshot, "providerAccountName") ??
                    "Not supplied"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-fg">Bank</dt>
                <dd>
                  {payoutSnapshotValue(latestApplication?.payoutDestinationSnapshot, "bankName") ??
                    payoutSnapshotValue(latestApplication?.payoutDestinationSnapshot, "bankCode") ??
                    "Not supplied"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-fg">Account</dt>
                <dd>{payoutSnapshotValue(latestApplication?.payoutDestinationSnapshot, "accountMask") ?? "Stored securely"}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-surface-muted/60 p-4">
            <h3 className="text-sm font-semibold text-fg">Student data acknowledgement</h3>
            <p className="mt-3 text-sm leading-6 text-fg-muted">
              {latestApplication?.studentDataAcknowledgementText ?? PAYMENT_ACCESS_ACKNOWLEDGEMENT_TEXT}
            </p>
            <p className="mt-3 text-sm text-fg-muted">
              {latestApplication?.studentDataAcknowledgedAt
                ? `Accepted ${displayDate(latestApplication.studentDataAcknowledgedAt)}`
                : "Not accepted"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
