"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { queueBatchIssuance } from "@/lib/api/client";
import type { ActivationDeliveryStatus, BatchIssuancePreview, BatchIssuanceResult } from "@/lib/api/types";
import { formatActivationDeliveryStatus, formatDateTime } from "@/lib/formatters";

function deliveryTone(status: ActivationDeliveryStatus) {
  switch (status) {
    case "Delivered":
      return "success";
    case "Failed":
      return "danger";
    case "Pending":
      return "warning";
  }
}

export function BatchIssuancePanel({ preview }: { preview: BatchIssuancePreview }) {
  const [batchResult, setBatchResult] = useState<BatchIssuanceResult | null>(null);
  const [copiedDeliveryId, setCopiedDeliveryId] = useState<string | null>(null);
  const [copyDeniedDeliveryId, setCopyDeniedDeliveryId] = useState<string | null>(null);
  const [isQueueing, setIsQueueing] = useState(false);

  async function handleQueueBatch() {
    setIsQueueing(true);
    const result = await queueBatchIssuance();
    setBatchResult(result);
    setIsQueueing(false);
  }

  async function handleCopy(deliveryId: string, activationUrl: string) {
    if (!navigator.clipboard) {
      setCopiedDeliveryId(null);
      setCopyDeniedDeliveryId(deliveryId);
      return;
    }

    try {
      await navigator.clipboard.writeText(activationUrl);
      setCopiedDeliveryId(deliveryId);
      setCopyDeniedDeliveryId(null);
    } catch {
      setCopiedDeliveryId(null);
      setCopyDeniedDeliveryId(deliveryId);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-zinc-500">Cohort</dt>
            <dd className="mt-1 font-medium text-zinc-950">{preview.cohortId}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">Requested count</dt>
            <dd className="mt-1 font-medium text-zinc-950">{preview.requestedCount}</dd>
          </div>
          <div>
            <dt className="text-sm text-zinc-500">Status</dt>
            <dd className="mt-1 font-medium text-zinc-950">{batchResult?.status ?? preview.status}</dd>
          </div>
        </dl>
        <button
          className="mt-6 h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={isQueueing}
          onClick={handleQueueBatch}
          type="button"
        >
          {isQueueing ? "Queueing" : "Queue batch"}
        </button>
      </section>

      {batchResult ? (
        <section className="rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="text-base font-semibold text-zinc-950">Activation delivery</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {batchResult.issuedCredentialIds.length} credential offer queued at {formatDateTime(batchResult.queuedAt)}.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Credential</th>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Delivery</th>
                  <th className="px-5 py-3 font-medium">Expires</th>
                  <th className="px-5 py-3 font-medium">Activation link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {batchResult.activationDeliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td className="px-5 py-4 font-medium text-zinc-950">{delivery.credentialId}</td>
                    <td className="px-5 py-4 text-zinc-600">{delivery.studentId}</td>
                    <td className="px-5 py-4">
                      <Badge tone={deliveryTone(delivery.status)}>
                        {formatActivationDeliveryStatus(delivery.status)}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-zinc-600">{formatDateTime(delivery.expiresAt)}</td>
                    <td className="min-w-80 px-5 py-4">
                      <div className="flex items-center gap-2">
                        <input
                          aria-label={`Activation link for ${delivery.credentialId}`}
                          className="h-9 min-w-0 flex-1 rounded-md border border-zinc-300 px-3 text-xs text-zinc-600"
                          readOnly
                          value={delivery.activationUrl}
                        />
                        <button
                          className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                          onClick={() => void handleCopy(delivery.id, delivery.activationUrl)}
                          type="button"
                        >
                          {copiedDeliveryId === delivery.id
                            ? "Copied"
                            : copyDeniedDeliveryId === delivery.id
                              ? "Select link"
                              : "Copy"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
