/**
 * @fileoverview Lists a vendor's branch payment access requests.
 * @module features/vendors/VendorPaymentAccessRequests
 */

import { CreditCard, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import {
  BranchPaymentAcceptanceStatus,
  BranchPaymentApplicationStatus,
} from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/formatters";

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
  return status === BranchPaymentApplicationStatus.APPROVED ? "success" as const : "warning" as const;
}

export function VendorPaymentAccessRequests({
  requests,
}: {
  requests: PaymentAccessRequest[];
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <CreditCard aria-hidden className="size-5 text-brand-700" />
          <h2 className="text-section-title text-fg">Payment requests</h2>
        </div>
      </div>
      <div className="divide-y divide-border">
        {requests.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-subtle">
            No payment access requests have been submitted yet.
          </p>
        ) : (
          requests.map((request) => (
            <div className="px-5 py-4" key={request.id}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-fg">{request.vendorBranch.name}</p>
                  <Badge tone={statusTone(request.status)}>
                    {request.status === BranchPaymentApplicationStatus.APPROVED ? "Approved" : "Pending"}
                  </Badge>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-muted">
                  <MapPin aria-hidden className="size-3.5 shrink-0" />
                  {request.vendorBranch.address || "No branch location supplied"}
                </p>
                <p className="mt-1 text-xs text-fg-subtle">
                  Submitted {formatDateTime((request.submittedAt ?? request.createdAt).toISOString())}
                  {request.vendorBranch.paymentAcceptance?.status === BranchPaymentAcceptanceStatus.ACTIVE
                    ? ` / QR ${request.vendorBranch.paymentAcceptance.qrIdentifier}`
                    : ""}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
