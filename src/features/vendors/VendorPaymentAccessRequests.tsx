/**
 * @fileoverview Lists a vendor's branch payment access requests.
 * @module features/vendors/VendorPaymentAccessRequests
 */

import Link from "next/link";
import { CreditCard, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import {
  BranchPaymentAcceptanceStatus,
  BranchPaymentApplicationStatus,
} from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/formatters";
import { accessButton, accessCardHeader, accessSecondaryButton } from "./payment-access/styles";

type PaymentAccessRequest = {
  id: string;
  status: BranchPaymentApplicationStatus;
  submittedAt: Date | null;
  createdAt: Date;
  vendorBranch: {
    id: string;
    name: string;
    address: string | null;
    paymentAcceptance: {
      qrIdentifier: string;
      status: BranchPaymentAcceptanceStatus;
    } | null;
  };
};

function statusTone(status: PaymentAccessRequest["status"]) {
  return status === BranchPaymentApplicationStatus.APPROVED ? "success" as const : status === "REJECTED" || status === "REVOKED" ? "danger" as const : "warning" as const;
}

export function VendorPaymentAccessRequests({
  requests,
}: {
  requests: PaymentAccessRequest[];
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <div className={accessCardHeader}>
        <div className="flex items-center gap-2">
          <CreditCard aria-hidden className="size-5 text-brand-700" />
          <h2 className="text-section-title text-fg">Payment access requests</h2>
        </div>
        <Link className={accessButton} href="/vendor/payments/access">Manage payment access</Link>
      </div>
      <div className="divide-y divide-border">
        {requests.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-subtle">
            No payment access requests have been submitted yet.
          </p>
        ) : (
          requests.map((request) => (
            <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" key={request.id}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-fg">{request.vendorBranch.name}</p>
                  <Badge tone={statusTone(request.status)}>
                    {request.status === "PENDING" ? "In review" : request.status === "REJECTED" ? "Not approved" : request.status.charAt(0) + request.status.slice(1).toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-fg-muted">
                  <MapPin aria-hidden className="size-3.5 shrink-0" />
                  {request.vendorBranch.address || "No branch location supplied"}
                </p>
                <p className="mt-1 text-xs text-fg-subtle">
                  Submitted {formatDateTime((request.submittedAt ?? request.createdAt).toISOString())}
                </p>
              </div>
              <Link className={accessSecondaryButton} href={`/vendor/branches/${request.vendorBranch.id}/payment-access`}>
                View request
                <span className="sr-only"> for {request.vendorBranch.name}</span>
              </Link>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
