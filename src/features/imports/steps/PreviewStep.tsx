"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { PreviewRowsTable } from "@/features/imports/PreviewRowsTable";
import type { ImportFieldDefinition } from "@/lib/imports/mapping";
import type { ImportRowStatus, PreviewRow } from "@/lib/imports/types";

const INLINE_PREVIEW_LIMIT = 5;
const FULL_VIEW_PAGE_SIZE = 50;

type PreviewCounts = {
  new: number;
  updated: number;
  unchanged: number;
  missing: number;
  error: number;
};

type PreviewResult = {
  filename: string;
  counts: PreviewCounts;
  rows: PreviewRow[];
  fileErrors?: string[];
};

const CATEGORIES: {
  key: keyof PreviewCounts;
  status: ImportRowStatus;
  label: string;
  tone: "success" | "warning" | "neutral" | "danger";
}[] = [
  { key: "new", label: "New", status: "New", tone: "success" },
  { key: "updated", label: "Updated", status: "Updated", tone: "warning" },
  { key: "unchanged", label: "Unchanged", status: "Unchanged", tone: "neutral" },
  { key: "missing", label: "Missing from file", status: "Missing", tone: "warning" },
  { key: "error", label: "Errors", status: "Error", tone: "danger" },
];

async function readErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `Request failed with status ${response.status}.`;
}

export function PreviewStep({
  file,
  fieldDefinitions,
  onBack,
}: {
  file: File;
  fieldDefinitions: ImportFieldDefinition[];
  onBack: () => void;
}) {
  const router = useRouter();
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<ImportRowStatus>>(new Set());
  const [fullViewStatus, setFullViewStatus] = useState<ImportRowStatus | null>(null);
  const [fullViewPage, setFullViewPage] = useState(1);

  const rowsByStatus = useMemo(() => {
    const map = new Map<ImportRowStatus, PreviewRow[]>();
    for (const row of result?.rows ?? []) {
      const list = map.get(row.status) ?? [];
      list.push(row);
      map.set(row.status, list);
    }
    return map;
  }, [result]);

  function toggleExpanded(status: ImportRowStatus) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }

  function openFullView(status: ImportRowStatus) {
    setFullViewStatus(status);
    setFullViewPage(1);
  }

  async function handleGenerate() {
    setError(null);
    setIsGenerating(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/students/import/preview", {
        body: formData,
        cache: "no-store",
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const body = (await response.json()) as PreviewResult;
      setResult(body);
      setExpanded(new Set());
      setFullViewStatus(null);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Failed to generate preview.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCommit() {
    setCommitError(null);
    setIsCommitting(true);

    try {
      const response = await fetch("/api/students/import/commit", { cache: "no-store", method: "POST" });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const body = (await response.json()) as { newCount: number; updatedCount: number };
      router.push(`/students?imported=${body.newCount}&updated=${body.updatedCount}`);
    } catch (commitFailure) {
      setCommitError(commitFailure instanceof Error ? commitFailure.message : "Failed to commit import.");
      setIsCommitting(false);
    }
  }

  if (result && fullViewStatus) {
    const category = CATEGORIES.find((candidate) => candidate.status === fullViewStatus)!;
    const rows = rowsByStatus.get(fullViewStatus) ?? [];
    const totalPages = Math.max(1, Math.ceil(rows.length / FULL_VIEW_PAGE_SIZE));
    const page = Math.min(fullViewPage, totalPages);
    const pageRows = rows.slice((page - 1) * FULL_VIEW_PAGE_SIZE, page * FULL_VIEW_PAGE_SIZE);
    const firstRow = rows.length === 0 ? 0 : (page - 1) * FULL_VIEW_PAGE_SIZE + 1;
    const lastRow = Math.min(page * FULL_VIEW_PAGE_SIZE, rows.length);

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{category.label}</h2>
            <p className="mt-1 text-sm text-zinc-600">{rows.length} rows from {result.filename}.</p>
          </div>
          <button
            className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            onClick={() => setFullViewStatus(null)}
            type="button"
          >
            Back to summary
          </button>
        </div>

        <PreviewRowsTable columns={fieldDefinitions} rows={pageRows} status={fullViewStatus} />

        {rows.length > FULL_VIEW_PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">
              Showing {firstRow}-{lastRow} of {rows.length} rows
            </p>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={page === 1}
                onClick={() => setFullViewPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                <ChevronLeft aria-hidden className="size-4" />
                Previous
              </button>
              <span className="text-xs text-zinc-500">
                Page {page} of {totalPages}
              </span>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={page === totalPages}
                onClick={() => setFullViewPage((current) => Math.min(totalPages, current + 1))}
                type="button"
              >
                Next
                <ChevronRight aria-hidden className="size-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Preview import</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Validate every row against your saved mapping and reconcile it against existing students. Nothing is
          saved to the student list yet.
        </p>
      </div>

      {!result ? (
        <button
          className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={isGenerating}
          onClick={handleGenerate}
          type="button"
        >
          {isGenerating ? "Generating preview" : "Generate preview"}
        </button>
      ) : null}

      {error ? <p className="text-sm text-amber-700">{error}</p> : null}

      {result ? (
        <div className="space-y-4">
          {result.fileErrors ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p className="font-medium">File parsing issues</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {result.fileErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
            {CATEGORIES.map(({ key, label, status, tone }) => {
              const rows = rowsByStatus.get(status) ?? [];
              const count = result.counts[key];
              const isExpanded = expanded.has(status);
              const visibleRows = rows.slice(0, INLINE_PREVIEW_LIMIT);
              const remainingCount = count - visibleRows.length;

              return (
                <div key={status}>
                  <button
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed"
                    disabled={count === 0}
                    onClick={() => toggleExpanded(status)}
                    type="button"
                  >
                    <span className="flex items-center gap-2 font-medium text-zinc-800">
                      {count > 0 ? (
                        isExpanded ? (
                          <ChevronDown aria-hidden className="size-4" />
                        ) : (
                          <ChevronRight aria-hidden className="size-4" />
                        )
                      ) : (
                        <span className="size-4" />
                      )}
                      {label}
                    </span>
                    <Badge tone={tone}>{count}</Badge>
                  </button>

                  {isExpanded && count > 0 ? (
                    <div className="space-y-2 border-t border-zinc-100 bg-zinc-50 px-4 py-3">
                      <PreviewRowsTable columns={fieldDefinitions} rows={visibleRows} status={status} />

                      {remainingCount > 0 ? (
                        <button
                          className="text-sm font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-950"
                          onClick={() => openFullView(status)}
                          type="button"
                        >
                          View all {count} {label.toLowerCase()} rows &rarr;
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {commitError ? <p className="text-sm text-amber-700">{commitError}</p> : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isGenerating || isCommitting}
              onClick={handleGenerate}
              type="button"
            >
              {isGenerating ? "Regenerating" : "Regenerate preview"}
            </button>

            <button
              className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              disabled={isCommitting || isGenerating || result.counts.new + result.counts.updated === 0}
              onClick={handleCommit}
              type="button"
            >
              {isCommitting
                ? "Committing"
                : `Commit ${result.counts.new} new, ${result.counts.updated} updated`}
            </button>
          </div>
        </div>
      ) : null}

      <div>
        <button
          className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          onClick={onBack}
          type="button"
        >
          Back
        </button>
      </div>
    </div>
  );
}
