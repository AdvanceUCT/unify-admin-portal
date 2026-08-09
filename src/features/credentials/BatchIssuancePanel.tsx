"use client";

import Link from "next/link";
import { Eye, LoaderCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { createBatchRun, previewBatchIssuance } from "@/lib/api/client";
import type {
  BatchIssuanceItemStatus,
  BatchIssuancePreview,
  BatchIssuancePreviewResult,
  BatchIssuanceSelection,
  CredentialLifecycleState,
} from "@/lib/api/types";
import { formatCredentialStatus } from "@/lib/formatters";

const credentialStatusOptions: Array<{ label: string; value: "" | CredentialLifecycleState }> = [
  { label: "Eligible statuses", value: "" },
  { label: formatCredentialStatus("NOT_ISSUED"), value: "NOT_ISSUED" },
  { label: formatCredentialStatus("OFFER_SENT"), value: "OFFER_SENT" },
  { label: formatCredentialStatus("ACCEPTED"), value: "ACCEPTED" },
  { label: formatCredentialStatus("ACTIVE"), value: "ACTIVE" },
  { label: formatCredentialStatus("SUSPENDED"), value: "SUSPENDED" },
  { label: formatCredentialStatus("EXPIRED"), value: "EXPIRED" },
  { label: formatCredentialStatus("LEGACY_NON_REVOCABLE"), value: "LEGACY_NON_REVOCABLE" },
  { label: formatCredentialStatus("FAILED"), value: "FAILED" },
  { label: formatCredentialStatus("REVOKED"), value: "REVOKED" },
];

function itemTone(status: BatchIssuanceItemStatus | "Eligible" | "Skipped") {
  if (status === "Delivered" || status === "Activated" || status === "Eligible") return "success";
  if (status === "Failed" || status === "DeliveryFailed") return "danger";
  if (status === "Skipped") return "neutral";
  return "warning";
}

export function BatchIssuancePanel({
  preview,
  programmesByFaculty,
}: {
  preview: BatchIssuancePreview;
  programmesByFaculty: Record<string, string[]>;
}) {
  const router = useRouter();
  const [credentialStatus, setCredentialStatus] = useState<"" | CredentialLifecycleState>("");
  const [faculty, setFaculty] = useState("");
  const [programme, setProgramme] = useState("");
  const [batchPreview, setBatchPreview] = useState<BatchIssuancePreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const facultyOptions = Object.keys(programmesByFaculty);
  const allProgrammeOptions = Object.values(programmesByFaculty).flat();
  const selection: BatchIssuanceSelection = {
    cohortId: preview.cohortId,
    credentialStatus: credentialStatus || undefined,
    faculty: faculty || undefined,
    programme: programme || undefined,
  };
  const programmeOptions = faculty ? programmesByFaculty[faculty] : allProgrammeOptions;
  const canConfirm = Boolean(batchPreview?.eligibleCount) && !isProcessing;

  function handleFacultyChange(nextFaculty: string) {
    const nextProgrammeOptions = nextFaculty ? programmesByFaculty[nextFaculty] : allProgrammeOptions;
    setFaculty(nextFaculty);

    if (programme && !nextProgrammeOptions.includes(programme)) {
      setProgramme("");
    }
  }

  async function handlePreview() {
    setError(null);
    setIsPreviewing(true);

    try {
      setBatchPreview(await previewBatchIssuance(selection));
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Batch preview failed.");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleConfirm() {
    setError(null);
    setIsProcessing(true);

    try {
      const run = await createBatchRun(selection);
      router.push(`/credentials/issuance/batch/runs/${encodeURIComponent(run.batchId)}`);
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Batch run failed.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5 shadow-md">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-section-title text-fg">Create batch run</h2>
            <p className="mt-1 text-sm text-fg-muted">Preview eligible students before generating offers.</p>
          </div>
          <Link
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
            href="/credentials/issuance/batch/runs"
          >
            <Eye aria-hidden className="size-4" />
            Batch history
          </Link>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-fg">Faculty</span>
            <select
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              onChange={(event) => handleFacultyChange(event.target.value)}
              value={faculty}
            >
              <option value="">All faculties</option>
              {facultyOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-fg">Programme</span>
            <select
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              onChange={(event) => setProgramme(event.target.value)}
              value={programme}
            >
              <option value="">All programmes</option>
              {programmeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-fg">Credential status</span>
            <select
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              onChange={(event) => setCredentialStatus(event.target.value as "" | CredentialLifecycleState)}
              value={credentialStatus}
            >
              {credentialStatusOptions.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle"
              disabled={isPreviewing || isProcessing}
              onClick={handlePreview}
              type="button"
            >
              {isPreviewing ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Eye aria-hidden className="size-4" />}
              {isPreviewing ? "Previewing" : "Preview batch"}
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg">
            {error}
          </p>
        ) : null}
      </section>

      {batchPreview ? (
        <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-section-title text-fg">Preview</h2>
              <p className="mt-1 text-sm text-fg-muted">
                {batchPreview.eligibleCount} eligible, {batchPreview.skippedCount} skipped from{" "}
                {batchPreview.requestedCount} matching students.
              </p>
            </div>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle"
              disabled={!canConfirm}
              onClick={handleConfirm}
              type="button"
            >
              {isProcessing ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}
              {isProcessing ? "Processing" : `Generate ${batchPreview.eligibleCount} offers`}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-center text-body">
              <thead className="border-b border-border">
                <tr className="whitespace-nowrap text-caption uppercase tracking-wide text-fg-subtle">
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Programme</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batchPreview.items.slice(0, 25).map((item) => (
                  <tr className="transition hover:bg-surface-muted/60" key={item.studentId}>
                    <td className="whitespace-nowrap px-5 py-4">
                      <p className="font-medium text-fg">{item.holderName}</p>
                      <p className="text-xs tabular-nums text-fg-subtle">{item.studentId}</p>
                    </td>
                    <td className="px-5 py-4 text-fg-muted">
                      {item.faculty} · {item.programme}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={itemTone(item.status)}>{item.status}</Badge>
                    </td>
                    <td className="px-5 py-4 text-fg-muted">{item.reason ?? "Ready for offer generation"}</td>
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
