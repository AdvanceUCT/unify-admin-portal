"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ImportFieldDefinition } from "@/lib/imports/mapping";

const NOT_MAPPED = "";

async function readErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `Save failed with status ${response.status}.`;
}

export function MappingStep({
  columns,
  existingColumnMap,
  fieldDefinitions,
  onBack,
  onContinue,
  onSaved,
}: {
  columns: string[];
  existingColumnMap: Record<string, string>;
  fieldDefinitions: ImportFieldDefinition[];
  onBack: () => void;
  onContinue: (columnMap: Record<string, string>) => void;
  onSaved: (columnMap: Record<string, string>) => void;
}) {
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fieldDefinitions) {
      const existingColumn = existingColumnMap[field.name];
      if (existingColumn && columns.includes(existingColumn)) {
        initial[field.name] = existingColumn;
      }
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);

  const systemFields = useMemo(() => fieldDefinitions.filter((field) => field.kind === "system"), [fieldDefinitions]);
  const customFields = useMemo(() => fieldDefinitions.filter((field) => field.kind === "custom"), [fieldDefinitions]);

  const mappedColumns = useMemo(() => new Set(Object.values(selections)), [selections]);
  const unmappedColumns = useMemo(() => columns.filter((column) => !mappedColumns.has(column)), [columns, mappedColumns]);

  const missingRequired = useMemo(
    () => fieldDefinitions.filter((field) => field.required && !selections[field.name]),
    [fieldDefinitions, selections],
  );
  const canSave = missingRequired.length === 0 && !isSaving && !isContinuing;

  function handleSelect(fieldName: string, column: string) {
    setSelections((current) => {
      const next = { ...current };
      if (column === NOT_MAPPED) {
        delete next[fieldName];
      } else {
        next[fieldName] = column;
      }
      return next;
    });
  }

  async function saveMapping() {
    const assignments = Object.entries(selections).map(([fieldName, csvColumn]) => ({ csvColumn, fieldName }));
    const response = await fetch("/api/students/import/mapping", {
      body: JSON.stringify({ assignments }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const result = (await response.json()) as { columnMap: Record<string, string> };
    return result.columnMap;
  }

  async function handleSave() {
    setError(null);
    setIsSaving(true);

    try {
      onSaved(await saveMapping());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save mapping.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleContinue() {
    setError(null);
    setIsContinuing(true);

    try {
      onContinue(await saveMapping());
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save mapping.");
    } finally {
      setIsContinuing(false);
    }
  }

  function renderFieldRow(field: ImportFieldDefinition) {
    const selectedColumn = selections[field.name] ?? NOT_MAPPED;
    // Excludes columns already claimed by another field so two fields can't be
    // pointed at the same column from the UI — the server enforces this too
    // (assertNoSharedColumns), this is just the primary, earlier defense.
    const availableColumns = columns.filter((column) => column === selectedColumn || !mappedColumns.has(column));

    return (
      <label key={field.name} className="grid grid-cols-[1fr_2fr] items-center gap-4 text-body">
        <span className="font-medium text-fg">
          {field.label}
          {field.required ? <span className="ml-1 text-danger-fg">*</span> : null}
        </span>
        <select
          className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          onChange={(event) => handleSelect(field.name, event.target.value)}
          value={selectedColumn}
        >
          <option value={NOT_MAPPED}>Not mapped</option>
          {availableColumns.map((column) => (
            <option key={column} value={column}>
              {column}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-section-title text-fg">Map columns</h2>
        <p className="mt-1 text-body text-fg-muted">
          Match each field to a column from your uploaded file. This mapping is saved so future imports don&apos;t
          need remapping from scratch.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-fg">System fields</h3>
        {systemFields.map(renderFieldRow)}
      </div>

      {customFields.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-fg">Custom fields</h3>
          {customFields.map(renderFieldRow)}
        </div>
      ) : null}

      {unmappedColumns.length > 0 ? (
        <p className="text-sm text-warning-fg">
          <span className="font-medium">Unmapped:</span> {unmappedColumns.join(", ")}. Map above, or add a field in{" "}
          <Link className="underline underline-offset-2" href="/students/import/fields">
            Manage fields
          </Link>
          .
        </p>
      ) : null}

      {error ? <p className="text-sm text-danger-fg">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          className="h-10 rounded-md border border-border px-4 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted"
          onClick={onBack}
          type="button"
        >
          Back
        </button>
        <button
          className="h-10 rounded-md border border-border px-4 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canSave}
          onClick={handleSave}
          type="button"
        >
          {isSaving ? "Saving" : "Save mapping"}
        </button>
        <button
          className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSave}
          onClick={handleContinue}
          type="button"
        >
          {isContinuing ? "Continuing" : "Continue to preview"}
        </button>
      </div>
    </div>
  );
}
