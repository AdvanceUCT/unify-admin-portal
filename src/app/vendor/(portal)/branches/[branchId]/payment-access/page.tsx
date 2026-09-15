/**
 * @fileoverview Vendor branch payment-access application page.
 * @module app/vendor/(portal)/branches/[branchId]/payment-access/page
 */

import { notFound, redirect } from "next/navigation";
import { MapPin } from "lucide-react";

import { BackButton } from "@/components/ui/BackButton";
import { Badge } from "@/components/ui/Badge";
import { PayoutDestinationCard } from "@/features/vendors/PayoutDestinationCard";
import { prisma } from "@/lib/db/prisma";
import {
  PAYMENT_ACCESS_ACKNOWLEDGEMENT_TEXT,
  getVendorPayoutDestinationSummary,
} from "@/lib/payments/branchOnboarding";
import { requireVendorOwnerContextForRender } from "@/lib/vendors/context";

import { requestBranchPaymentAccessAction } from "../../actions";
import { savePayoutDestinationAction } from "../../../payments/actions";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusTone(status: string | undefined) {
  if (status === "APPROVED") return "success" as const;
  if (status === "PENDING") return "warning" as const;
  if (status === "REJECTED" || status === "REVOKED") return "danger" as const;
  return "neutral" as const;
}

export default async function VendorBranchPaymentAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{
    payout?: string | string[];
    payoutError?: string | string[];
  }>;
}) {
  const { context } = await requireVendorOwnerContextForRender();
  const { branchId } = await params;
  const query = await searchParams;
  const branch = await prisma.vendorBranch.findFirst({
    where: { id: branchId, vendorProfileId: context.vendorProfileId },
    include: {
      paymentAcceptance: { select: { qrIdentifier: true, status: true } },
      paymentApplications: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          submittedAt: true,
          reviewNotes: true,
          studentDataAcknowledgedAt: true,
          payoutDestinationReferenceSnapshot: true,
        },
      },
    },
  });
  if (!branch) notFound();

  const payoutDestination = await getVendorPayoutDestinationSummary(context.vendorProfileId);
  const latestApplication = branch.paymentApplications[0] ?? null;
  const activeAcceptance = branch.paymentAcceptance?.status === "ACTIVE" ? branch.paymentAcceptance : null;
  const canSubmit =
    !activeAcceptance &&
    branch.active &&
    branch.status === "ACTIVE" &&
    Boolean(payoutDestination) &&
    (!latestApplication || ["REJECTED", "REVOKED", "WITHDRAWN", "PENDING"].includes(latestApplication.status));
  const applicationComplete = Boolean(
    latestApplication?.studentDataAcknowledgedAt &&
      latestApplication.payoutDestinationReferenceSnapshot,
  );

  if (
    activeAcceptance ||
    latestApplication?.status === "APPROVED" ||
    (latestApplication?.status === "PENDING" && applicationComplete)
  ) {
    redirect(`/vendor/branches/${branch.id}`);
  }

  return (
    <div className="space-y-6">
      <BackButton href={`/vendor/branches/${branch.id}`} label="Back to branch" />

      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-page-title text-fg">Payment access application</h1>
            <p className="mt-1 text-sm text-fg-subtle">{branch.name}</p>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-fg-muted">
              <MapPin aria-hidden className="size-4" />
              {branch.address || "No branch location supplied"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={branch.active && branch.status === "ACTIVE" ? "success" : "warning"}>
              {branch.active ? branch.status.replaceAll("_", " ") : "Inactive"}
            </Badge>
            {activeAcceptance ? (
              <Badge tone="success">Payment approved</Badge>
            ) : latestApplication ? (
              <Badge tone={statusTone(latestApplication.status)}>
                {latestApplication.status.replaceAll("_", " ")}
              </Badge>
            ) : (
              <Badge tone="neutral">Not requested</Badge>
            )}
          </div>
        </div>
      </section>

      <PayoutDestinationCard
        action={savePayoutDestinationAction}
        destinationSummary={payoutDestination ? {
          ...payoutDestination.snapshot,
          provider: payoutDestination.provider,
          reference: payoutDestination.reference,
        } : null}
        hasDestination={Boolean(payoutDestination)}
        payout={firstParam(query.payout)}
        payoutError={firstParam(query.payoutError)}
        returnTo={`/vendor/branches/${branch.id}/payment-access`}
      />

      {!activeAcceptance ? (
        <section className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-md">
          <div>
            <h2 className="text-section-title text-fg">Submit request</h2>
            <p className="mt-1 text-sm text-fg-subtle">
              This sends the branch, payout destination, and acknowledgement to the university for review.
            </p>
          </div>

          {latestApplication?.reviewNotes ? (
            <div className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-fg">
              Last review note: {latestApplication.reviewNotes}
            </div>
          ) : null}

          {!branch.active || branch.status !== "ACTIVE" ? (
            <p className="rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg">
              Payment access can be requested once this branch is active.
            </p>
          ) : !payoutDestination ? (
            <p className="rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg">
              Save a payout destination before submitting this request.
            </p>
          ) : null}

          <form action={requestBranchPaymentAccessAction} className="space-y-4">
            <input name="branchId" type="hidden" value={branch.id} />
            <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted/60 p-4 text-sm text-fg-muted">
              <input
                className="mt-1 size-4 rounded border-border text-brand-600"
                name="acknowledgement"
                required
                type="checkbox"
              />
              <span>{PAYMENT_ACCESS_ACKNOWLEDGEMENT_TEXT}</span>
            </label>
            <button
              className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSubmit}
              type="submit"
            >
              Submit payment request
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
