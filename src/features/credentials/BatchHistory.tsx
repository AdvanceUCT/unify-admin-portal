"use client";

import { useEffect, useState } from "react";
import { getBatchHistory } from "@/lib/api/client";
import { formatDateTime } from "@/lib/formatters";

type BatchRecord = {
  id: string;
  cohortId: string;
  status: string;
  requestedCount: number;
  issuedCount: number;
  faculties: string;
  lifecycleStates: string;
  queuedAt: string;
};

export function BatchHistory() {
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBatchHistory()
      .then(setBatches)
      .catch(() => setBatches([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <p className="text-sm text-zinc-400">Loading batch history...</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-base font-semibold text-zinc-950">Batch history</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Previous batch issuance runs for this cohort.
        </p>
      </div>

      {batches.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-zinc-400">
          No batches have been issued yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-medium">Batch ID</th>
                <th className="px-5 py-3 font-medium">Issued</th>
                <th className="px-5 py-3 font-medium">Faculties</th>
                <th className="px-5 py-3 font-medium">States</th>
                <th className="px-5 py-3 font-medium">Count</th>
                <th className="px-5 py-3 font-medium">Queued at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td className="px-5 py-4 font-mono text-xs text-zinc-500">{batch.id}</td>
                  <td className="px-5 py-4 font-medium text-zinc-950">{batch.issuedCount}</td>
                  <td className="px-5 py-4 text-zinc-600">{batch.faculties}</td>
                  <td className="px-5 py-4 text-zinc-600">{batch.lifecycleStates}</td>
                  <td className="px-5 py-4 text-zinc-600">{batch.requestedCount}</td>
                  <td className="px-5 py-4 text-zinc-600">{formatDateTime(batch.queuedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}