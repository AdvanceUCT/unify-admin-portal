/**
 * @fileoverview Admin branch payment-access review page.
 * @module app/(admin)/vendors/payment-access/[branchId]/page
 */

import { notFound } from "next/navigation";

import { BackButton } from "@/components/ui/BackButton";
import { Badge } from "@/components/ui/Badge";
import { requireRoleForRender } from "@/lib/auth/session";
import { getBranchPaymentAccessDetail } from "@/lib/payments/branchOnboarding";

import {
  approveBranchPaymentApplicationAction,
  closeBranchPaymentAcceptanceAction,
  rejectBranchPaymentApplicationAction,
  setBranchCampusStatusAction,
} from "../../actions";

function displayDate(value: Date | null) {
  if (!value) return null;
  return value.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function campusStatusLabel(value: "ON_CAMPUS" | "OFF_CAMPUS" | null) {
  if (value === "ON_CAMPUS") return "On campus";
  if (value === "OFF_CAMPUS") return "Off campus";
  return "Unclassified";
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
  const canApprovePending =
    Boolean(pendingApplication) &&
    branch.campusStatus === "ON_CAMPUS" &&
    branch.active &&
    branch.status === "ACTIVE";

  return (
    <div className="space-y-6">
      <BackButton href="/vendors?tab=payments" label="Back to Payment Access" />

      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-page-title text-fg">{branch.vendorProfile.companyName}</h1>
            <p className="mt-1 text-sm text-fg-subtle">
              {branch.name} &middot; {branch.vendorProfile.serviceCategory}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={branch.active && branch.status === "ACTIVE" ? "success" : "warning"}>
              {branch.active ? branch.status.replaceAll("_", " ") : "Inactive"}
            </Badge>
            <Badge tone={branch.campusStatus === "ON_CAMPUS" ? "success" : "neutral"}>
              {campusStatusLabel(branch.campusStatus)}
            </Badge>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Campus classification</h2>
          <p className="mt-1 text-sm text-fg-subtle">
            New payment approvals require the branch to be classified as on-campus.
          </p>
        </div>
        <div className="p-5">
          <form action={setBranchCampusStatusAction} className="flex flex-wrap items-center gap-2">
            <input name="branchId" type="hidden" value={branch.id} />
            <select
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              defaultValue={branch.campusStatus ?? ""}
              name="campusStatus"
              required
            >
              <option disabled value="">
                Classify campus status
              </option>
              <option value="ON_CAMPUS">On campus</option>
              <option value="OFF_CAMPUS">Off campus</option>
            </select>
            <button
              className="h-10 rounded-md border border-border bg-surface px-4 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
              type="submit"
            >
              Save
            </button>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-section-title text-fg">Payment access</h2>
        </div>
        <div className="space-y-5 p-5">
          {activeAcceptance ? (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">
                This branch is approved to accept UNIFY wallet payments. QR identifier:{" "}
                <span className="font-mono text-fg">{activeAcceptance.qrIdentifier}</span>.
              </p>
              <form action={closeBranchPaymentAcceptanceAction} className="space-y-3">
                <input name="branchId" type="hidden" value={branch.id} />
                <label className="block text-sm">
                  <span className="font-medium text-fg-muted">Closure reason</span>
                  <textarea
                    className="mt-1.5 min-h-20 w-full rounded-md border border-border px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    name="notes"
                    placeholder="Required before closing payment access."
                    required
                  />
                </label>
                <button
                  className="h-9 rounded-md border border-danger-border bg-danger-bg px-3 text-sm font-medium text-danger-fg transition hover:bg-danger-border"
                  type="submit"
                >
                  Close payment access
                </button>
              </form>
            </div>
          ) : pendingApplication ? (
            <div className="space-y-5">
              <p className="text-sm text-fg-muted">
                Payment-access request submitted{" "}
                {pendingApplication.submittedAt ? displayDate(pendingApplication.submittedAt) : displayDate(pendingApplication.createdAt)}.
              </p>
              {!canApprovePending ? (
                <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-fg">
                  Mark the branch as on-campus and ensure it is active before approving.
                </p>
              ) : null}
              <form action={approveBranchPaymentApplicationAction} className="space-y-3">
                <input name="applicationId" type="hidden" value={pendingApplication.id} />
                <input name="branchId" type="hidden" value={branch.id} />
                <label className="block text-sm">
                  <span className="font-medium text-fg-muted">Approval note</span>
                  <textarea
                    className="mt-1.5 min-h-20 w-full rounded-md border border-border px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    name="notes"
                    placeholder="Optional internal note."
                  />
                </label>
                <button
                  className="h-9 rounded-md border border-success-border bg-success-bg px-3 text-sm font-medium text-success-fg transition hover:bg-success-border disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canApprovePending}
                  type="submit"
                >
                  Approve payment QR access
                </button>
              </form>
              <form action={rejectBranchPaymentApplicationAction} className="space-y-3 border-t border-border pt-5">
                <input name="applicationId" type="hidden" value={pendingApplication.id} />
                <input name="branchId" type="hidden" value={branch.id} />
                <label className="block text-sm">
                  <span className="font-medium text-fg-muted">Rejection reason</span>
                  <textarea
                    className="mt-1.5 min-h-20 w-full rounded-md border border-border px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    name="notes"
                    placeholder="Required before rejecting."
                    required
                  />
                </label>
                <button
                  className="h-9 rounded-md border border-danger-border bg-danger-bg px-3 text-sm font-medium text-danger-fg transition hover:bg-danger-border"
                  type="submit"
                >
                  Reject request
                </button>
              </form>
            </div>
          ) : latestApplication ? (
            <p className="text-sm text-fg-muted">
              Latest request status: {latestApplication.status.replaceAll("_", " ")}
              {latestApplication.reviewNotes ? ` — ${latestApplication.reviewNotes}` : ""}.
            </p>
          ) : (
            <p className="text-sm text-fg-subtle">
              This branch has not requested wallet payment access yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
