"use client";

import Link from "next/link";
import { CheckCircle2, Copy, Eye, LoaderCircle, Send } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { createBatchRun, previewBatchIssuance } from "@/lib/api/client";
import type {
  BatchIssuanceItemStatus,
  BatchIssuancePreview,
  BatchIssuancePreviewResult,
  BatchIssuanceRunDetail,
  BatchIssuanceRunStatus,
  BatchIssuanceSelection,
  CredentialLifecycleState,
  StudentCredential,
} from "@/lib/api/types";
import { formatDateTime } from "@/lib/formatters";
import { SIMULATED_FACULTY_PROGRAMMES } from "@/lib/student-records/facultyProgrammes";

const credentialStatusOptions: Array<{ label: string; value: "" | CredentialLifecycleState }> = [
  { label: "Pending or issuing", value: "" },
  { label: "Pending only", value: "Pending" },
  { label: "Issuing only", value: "Issuing" },
];

const enrolmentStatusOptions: Array<StudentCredential["enrolmentStatus"]> = [
  "Registered",
  "Suspended",
  "Withdrawn",
  "Graduated",
];
const facultyOptions = Object.keys(SIMULATED_FACULTY_PROGRAMMES);
const allProgrammeOptions = Object.values(SIMULATED_FACULTY_PROGRAMMES).flat();

function runTone(status: BatchIssuanceRunStatus) {
  if (status === "Completed") return "success";
  if (status === "PartiallyFailed" || status === "Failed") return "danger";
  if (status === "Processing" || status === "Queued") return "warning";
  return "neutral";
}

function itemTone(status: BatchIssuanceItemStatus | "Eligible" | "Skipped") {
  if (status === "Delivered" || status === "Activated" || status === "Eligible") return "success";
  if (status === "Failed" || status === "DeliveryFailed") return "danger";
  if (status === "Skipped") return "neutral";
  return "warning";
}

export function BatchIssuancePanel({ preview }: { preview: BatchIssuancePreview }) {
  const [copiedStudentId, setCopiedStudentId] = useState<string | null>(null);
  const [credentialStatus, setCredentialStatus] = useState<"" | CredentialLifecycleState>("");
  const [enrolmentStatus, setEnrolmentStatus] = useState<StudentCredential["enrolmentStatus"]>("Registered");
  const [faculty, setFaculty] = useState("");
  const [programme, setProgramme] = useState("");
  const [batchPreview, setBatchPreview] = useState<BatchIssuancePreviewResult | null>(null);
  const [batchRun, setBatchRun] = useState<BatchIssuanceRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const selection: BatchIssuanceSelection = {
    cohortId: preview.cohortId,
    credentialStatus: credentialStatus || undefined,
    enrolmentStatus,
    faculty: faculty || undefined,
    programme: programme || undefined,
  };
  const programmeOptions = faculty ? SIMULATED_FACULTY_PROGRAMMES[faculty] : allProgrammeOptions;
  const canConfirm = Boolean(batchPreview?.eligibleCount) && !isProcessing;

  function handleFacultyChange(nextFaculty: string) {
    const nextProgrammeOptions = nextFaculty ? SIMULATED_FACULTY_PROGRAMMES[nextFaculty] : allProgrammeOptions;
    setFaculty(nextFaculty);

    if (programme && !nextProgrammeOptions.includes(programme)) {
      setProgramme("");
    }
  }

  async function handlePreview() {
    setError(null);
    setBatchRun(null);
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
      setBatchRun(await createBatchRun(selection));
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Batch run failed.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleCopy(studentId: string, activationUrl?: string) {
    if (!activationUrl || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activationUrl);
      setCopiedStudentId(studentId);
    } catch {
      setCopiedStudentId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-950">Create batch run</h2>
            <p className="mt-1 text-sm text-zinc-500">Preview eligible students before generating offers.</p>
          </div>
          <Link
            className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            href="/credentials/batch/runs"
          >
            <Eye aria-hidden className="size-4" />
            Batch history
          </Link>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-zinc-700">Faculty</span>
            <select
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none"
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
            <span className="font-medium text-zinc-700">Programme</span>
            <select
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none"
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
            <span className="font-medium text-zinc-700">Credential status</span>
            <select
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 focus:border-zinc-500 focus:outline-none"
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
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-zinc-700">Enrolment status</span>
            <select
              className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 focus:border-zinc-500 focus:outline-none"
              onChange={(event) => setEnrolmentStatus(event.target.value as StudentCredential["enrolmentStatus"])}
              value={enrolmentStatus}
            >
              {enrolmentStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              disabled={isPreviewing || isProcessing}
              onClick={handlePreview}
              type="button"
            >
              {isPreviewing ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Eye aria-hidden className="size-4" />}
              {isPreviewing ? "Previewing" : "Preview batch"}
            </button>
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-amber-700">{error}</p> : null}
      </section>

      {batchPreview ? (
        <section className="rounded-lg border border-zinc-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-950">Preview</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {batchPreview.eligibleCount} eligible, {batchPreview.skippedCount} skipped from{" "}
                {batchPreview.requestedCount} matching students.
              </p>
            </div>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              disabled={!canConfirm}
              onClick={handleConfirm}
              type="button"
            >
              {isProcessing ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}
              {isProcessing ? "Processing" : `Generate ${batchPreview.eligibleCount} offers`}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Programme</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {batchPreview.items.slice(0, 25).map((item) => (
                  <tr key={item.studentId}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-zinc-950">{item.holderName}</p>
                      <p className="text-xs text-zinc-500">{item.studentId}</p>
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {item.faculty} · {item.programme}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={itemTone(item.status)}>{item.status}</Badge>
                    </td>
                    <td className="px-5 py-4 text-zinc-600">{item.reason ?? "Ready for offer generation"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {batchRun ? (
        <section className="rounded-lg border border-zinc-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-base font-semibold text-zinc-950">{batchRun.batchId}</h2>
                <Badge tone={runTone(batchRun.status)}>{batchRun.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                {batchRun.issuedCount} delivered, {batchRun.failedCount} failed, {batchRun.skippedCount} skipped.
              </p>
            </div>
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              href={`/credentials/batch/runs/${encodeURIComponent(batchRun.batchId)}`}
            >
              <CheckCircle2 aria-hidden className="size-4" />
              View run
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Credential</th>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Delivery</th>
                  <th className="px-5 py-3 font-medium">Activation link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {batchRun.items.filter((item) => item.status !== "Skipped").slice(0, 25).map((item) => (
                  <tr key={item.studentId}>
                    <td className="px-5 py-4 font-medium text-zinc-950">{item.credentialId}</td>
                    <td className="px-5 py-4 text-zinc-600">{item.studentId}</td>
                    <td className="px-5 py-4">
                      <Badge tone={itemTone(item.status)}>{item.status}</Badge>
                      {item.deliveredAt ? <p className="mt-2 text-xs text-zinc-500">{formatDateTime(item.deliveredAt)}</p> : null}
                      {item.failureReason ? <p className="mt-2 text-xs text-amber-700">{item.failureReason}</p> : null}
                    </td>
                    <td className="min-w-72 px-5 py-4">
                      <button
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!item.activationUrl}
                        onClick={() => void handleCopy(item.studentId, item.activationUrl)}
                        type="button"
                      >
                        <Copy aria-hidden className="size-4" />
                        {copiedStudentId === item.studentId ? "Copied" : "Copy link"}
                      </button>
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
