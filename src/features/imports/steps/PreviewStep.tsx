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
  importRunId: string;
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
  columns,
  columnMap,
  file,
  fieldDefinitions,
  onBack,
}: {
  columns: string[];
  columnMap: Record<string, string>;
  file: File;
  fieldDefinitions: ImportFieldDefinition[];
  onBack: () => void;
}) {
  const router = useRouter();
  const mappedColumns = useMemo(() => new Set(Object.values(columnMap)), [columnMap]);
  const unmappedColumns = useMemo(() => columns.filter((column) => !mappedColumns.has(column)), [columns, mappedColumns]);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<ImportRowStatus>>(new Set());
  const [fullViewStatus, setFullViewStatus] = useState<ImportRowStatus | null>(null);
  const [fullViewPage, setFullViewPage] = useState(1);
  const hasBlockingErrors = Boolean(result?.counts.error);

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
      setCommitError(null);
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
      if (!result?.importRunId) {
        throw new Error("Generate a preview before committing this import.");
      }

      const response = await fetch("/api/students/import/commit", {
        body: JSON.stringify({ importRunId: result.importRunId }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

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
            <h2 className="text-section-title text-fg">{category.label}</h2>
            <p className="mt-1 text-body text-fg-muted">{rows.length} rows from {result.filename}.</p>
          </div>
          <button
            className="h-9 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted"
            onClick={() => setFullViewStatus(null)}
            type="button"
          >
            Back to summary
          </button>
        </div>

        <PreviewRowsTable columns={fieldDefinitions} rows={pageRows} status={fullViewStatus} />

        {rows.length > FULL_VIEW_PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-caption text-fg-subtle">
              Showing {firstRow}-{lastRow} of {rows.length} rows
            </p>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                disabled={page === 1}
                onClick={() => setFullViewPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                <ChevronLeft aria-hidden className="size-4" />
                Previous
              </button>
              <span className="text-caption text-fg-subtle">
                Page {page} of {totalPages}
              </span>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
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
        <h2 className="text-section-title text-fg">Preview import</h2>
        <p className="mt-1 text-body text-fg-muted">
          Validate every row against your saved mapping and reconcile it against existing students. Nothing is
          saved to the student list yet.
        </p>
      </div>

      {!result ? (
        <button
          className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isGenerating}
          onClick={handleGenerate}
          type="button"
        >
          {isGenerating ? "Generating preview" : "Generate preview"}
        </button>
      ) : null}

      {error ? <p className="text-sm text-danger-fg">{error}</p> : null}

      {unmappedColumns.length > 0 ? (
        <div className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-fg">
          <p className="font-medium">
            {unmappedColumns.length} column{unmappedColumns.length === 1 ? "" : "s"} from this file{" "}
            {unmappedColumns.length === 1 ? "was" : "were"} left unmapped: {unmappedColumns.join(", ")}.
          </p>
          <p className="mt-1">Data in these columns was not imported. Go back to map them if needed.</p>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-4">
          {result.fileErrors ? (
            <div className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-fg">
              <p className="font-medium">File parsing issues</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {result.fileErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="divide-y divide-border rounded-lg border border-border">
            {CATEGORIES.map(({ key, label, status, tone }) => {
              const rows = rowsByStatus.get(status) ?? [];
              const count = result.counts[key];
              const isExpanded = expanded.has(status);
              const visibleRows = rows.slice(0, INLINE_PREVIEW_LIMIT);
              const remainingCount = count - visibleRows.length;

              return (
                <div key={status}>
                  <button
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm transition hover:bg-surface-muted disabled:cursor-not-allowed"
                    disabled={count === 0}
                    onClick={() => toggleExpanded(status)}
                    type="button"
                  >
                    <span className="flex items-center gap-2 font-medium text-fg">
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
                    <div className="space-y-2 border-t border-border bg-surface-muted px-4 py-3">
                      <PreviewRowsTable columns={fieldDefinitions} rows={visibleRows} status={status} />

                      {remainingCount > 0 ? (
                        <button
                          className="inline-flex items-center gap-1 text-sm font-medium text-fg-muted underline underline-offset-2 hover:text-fg"
                          onClick={() => openFullView(status)}
                          type="button"
                        >
                          View all {count} {label.toLowerCase()} rows
                          <ChevronRight aria-hidden className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {commitError ? <p className="text-sm text-danger-fg">{commitError}</p> : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="h-9 rounded-md border border-border px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isGenerating || isCommitting}
              onClick={handleGenerate}
              type="button"
            >
              {isGenerating ? "Regenerating" : "Regenerate preview"}
            </button>

            <button
              className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isCommitting || isGenerating || hasBlockingErrors || result.counts.new + result.counts.updated === 0}
              onClick={handleCommit}
              type="button"
            >
              {isCommitting
                ? "Committing"
                : `Commit ${result.counts.new} new, ${result.counts.updated} updated`}
            </button>
          </div>
          {hasBlockingErrors ? (
            <p className="text-sm text-danger-fg">Fix or remove rows with errors before committing this import.</p>
          ) : null}
        </div>
      ) : null}

      <div>
        <button
          className="h-10 rounded-md border border-border px-4 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted"
          onClick={onBack}
          type="button"
        >
          Back
        </button>
      </div>
    </div>
  );
}
