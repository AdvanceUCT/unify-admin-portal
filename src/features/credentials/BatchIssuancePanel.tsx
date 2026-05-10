"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { queueBatchIssuance } from "@/lib/api/client";
import type { ActivationDeliveryStatus, BatchIssuancePreview, BatchIssuanceResult } from "@/lib/api/types";
import { formatActivationDeliveryStatus, formatDateTime } from "@/lib/formatters";

function deliveryTone(status: ActivationDeliveryStatus) {
  switch (status) {
    case "Delivered": return "success";
    case "Failed": return "danger";
    case "Pending": return "warning";
  }
}

const LIFECYCLE_STATE_OPTIONS = [
  { value: "Pending", label: "Pending" },
  { value: "Issuing", label: "Issuing" },
];

export function BatchIssuancePanel({ preview }: { preview: BatchIssuancePreview }) {
  const [selectedFaculties, setSelectedFaculties] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>(["Pending", "Issuing"]);
  const [limit, setLimit] = useState<number>(100);
  const [batchResult, setBatchResult] = useState<BatchIssuanceResult | null>(null);
  const [copiedDeliveryId, setCopiedDeliveryId] = useState<string | null>(null);
  const [copyDeniedDeliveryId, setCopyDeniedDeliveryId] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [isQueueing, setIsQueueing] = useState(false);

  // Live preview count — updates instantly as filters change
  const matchingCount = useMemo(() => {
    // If no faculty selected, all faculties match
    const facultyMatch = selectedFaculties.length === 0
      ? preview.eligibleCount
      : Math.round((selectedFaculties.length / preview.faculties.length) * preview.eligibleCount);

    // Scale by selected states
    const stateRatio = selectedStates.length / LIFECYCLE_STATE_OPTIONS.length;
    const estimated = Math.round(facultyMatch * stateRatio);

    return Math.min(estimated, limit);
  }, [selectedFaculties, selectedStates, limit, preview]);

  function toggleFaculty(faculty: string) {
    setSelectedFaculties((prev) =>
      prev.includes(faculty) ? prev.filter((f) => f !== faculty) : [...prev, faculty]
    );
  }

  function toggleState(state: string) {
    setSelectedStates((prev) =>
      prev.includes(state) ? prev.filter((s) => s !== state) : [...prev, state]
    );
  }

  async function handleQueueBatch() {
    if (selectedStates.length === 0) {
      setQueueError("Please select at least one lifecycle state.");
      return;
    }

    setIsQueueing(true);
    setQueueError(null);

    try {
      const result = await queueBatchIssuance({
        faculties: selectedFaculties.length > 0 ? selectedFaculties : undefined,
        lifecycleStates: selectedStates,
        limit,
      });
      setBatchResult(result);
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : "Batch queue request failed.");
    } finally {
      setIsQueueing(false);
    }
  }

  async function handleCopy(deliveryId: string, activationUrl: string) {
    if (!navigator.clipboard) {
      setCopyDeniedDeliveryId(deliveryId);
      return;
    }
    try {
      await navigator.clipboard.writeText(activationUrl);
      setCopiedDeliveryId(deliveryId);
      setCopyDeniedDeliveryId(null);
    } catch {
      setCopyDeniedDeliveryId(deliveryId);
    }
  }

  const activationDeliveries = batchResult?.activationDeliveries ?? [];

  return (
    <div className="space-y-6">
      {/* Filter and preview panel */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="space-y-5">

          {/* Cohort info */}
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-zinc-500">Cohort</dt>
              <dd className="mt-1 font-medium text-zinc-950">{preview.cohortId}</dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Eligible students</dt>
              <dd className="mt-1 font-medium text-zinc-950">{preview.eligibleCount}</dd>
            </div>
            <div>
              <dt className="text-sm text-zinc-500">Status</dt>
              <dd className="mt-1 font-medium text-zinc-950">
                {batchResult?.status ?? preview.status}
              </dd>
            </div>
          </dl>

          <hr className="border-zinc-100" />

          {/* Faculty filter */}
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-700">
              Faculty
              <span className="ml-2 text-xs font-normal text-zinc-400">
                Leave unchecked to include all faculties
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {preview.faculties.map((faculty) => (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm transition hover:border-zinc-400"
                  key={faculty}
                >
                  <input
                    checked={selectedFaculties.includes(faculty)}
                    className="h-4 w-4 rounded border-zinc-300"
                    onChange={() => toggleFaculty(faculty)}
                    type="checkbox"
                  />
                  {faculty}
                </label>
              ))}
            </div>
          </div>

          {/* Lifecycle state filter */}
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-700">Lifecycle state</p>
            <div className="flex gap-2">
              {LIFECYCLE_STATE_OPTIONS.map((option) => (
                <label
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm transition hover:border-zinc-400"
                  key={option.value}
                >
                  <input
                    checked={selectedStates.includes(option.value)}
                    className="h-4 w-4 rounded border-zinc-300"
                    onChange={() => toggleState(option.value)}
                    type="checkbox"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          {/* Limit */}
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700" htmlFor="limit">
              Maximum students to issue
            </label>
            <input
              className="h-9 w-32 rounded-md border border-zinc-300 px-3 text-sm focus:border-zinc-500 focus:outline-none"
              id="limit"
              max={preview.totalStudents}
              min={1}
              onChange={(e) => setLimit(Math.max(1, parseInt(e.target.value) || 1))}
              type="number"
              value={limit}
            />
          </div>

          {/* Live preview count */}
          <div className="rounded-md bg-zinc-50 px-4 py-3">
            <p className="text-sm text-zinc-600">
              <span className="font-semibold text-zinc-950">{matchingCount}</span>
              {" "}student{matchingCount !== 1 ? "s" : ""} will be issued credentials with the current filters.
            </p>
          </div>

          {/* Queue button */}
          <div className="flex items-center gap-4">
            <button
              className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              disabled={isQueueing || selectedStates.length === 0}
              onClick={handleQueueBatch}
              type="button"
            >
              {isQueueing ? "Queueing..." : "Queue batch"}
            </button>
            {selectedStates.length === 0 && (
              <p className="text-xs text-zinc-400">Select at least one lifecycle state.</p>
            )}
          </div>

          {queueError && (
            <p className="text-sm text-amber-700">{queueError}</p>
          )}
        </div>
      </section>

      {/* Activation delivery table */}
      {batchResult && (
        <section className="rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-5 py-4">
            <h2 className="text-base font-semibold text-zinc-950">Activation delivery</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {activationDeliveries.length} credential{activationDeliveries.length !== 1 ? "s" : ""} offered at {formatDateTime(batchResult.queuedAt)}.
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
                {activationDeliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td className="px-5 py-4 font-medium text-zinc-950">{delivery.credentialId}</td>
                    <td className="px-5 py-4 text-zinc-600">{delivery.studentNumber ?? delivery.studentId}</td>
                    <td className="px-5 py-4">
                      <Badge tone={deliveryTone(delivery.status)}>
                        {formatActivationDeliveryStatus(delivery.status)}
                      </Badge>
                      {delivery.activatedAt && (
                        <p className="mt-2 text-xs text-zinc-500">
                          Activated {formatDateTime(delivery.activatedAt)}
                        </p>
                      )}
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
      )}
    </div>
  );
}