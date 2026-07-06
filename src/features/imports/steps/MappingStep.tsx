"use client";

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
  onSaved,
}: {
  columns: string[];
  existingColumnMap: Record<string, string>;
  fieldDefinitions: ImportFieldDefinition[];
  onBack: () => void;
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

  const missingRequired = useMemo(
    () => fieldDefinitions.filter((field) => field.required && !selections[field.name]),
    [fieldDefinitions, selections],
  );
  const canSave = missingRequired.length === 0 && !isSaving;

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

  async function handleSave() {
    setError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/students/import/mapping", {
        body: JSON.stringify({ columnMap: selections }),
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const result = (await response.json()) as { columnMap: Record<string, string> };
      onSaved(result.columnMap);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save mapping.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Map columns</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Match each system field to a column from your uploaded file. This mapping is saved so future imports
          don&apos;t need remapping from scratch.
        </p>
      </div>

      <div className="space-y-3">
        {fieldDefinitions.map((field) => (
          <label key={field.name} className="grid grid-cols-[1fr_2fr] items-center gap-4 text-sm">
            <span className="font-medium text-zinc-700">
              {field.label}
              {field.required ? <span className="ml-1 text-rose-600">*</span> : null}
            </span>
            <select
              className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-800 focus:border-zinc-500 focus:outline-none"
              onChange={(event) => handleSelect(field.name, event.target.value)}
              value={selections[field.name] ?? NOT_MAPPED}
            >
              <option value={NOT_MAPPED}>Not mapped</option>
              {columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {error ? <p className="text-sm text-amber-700">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          onClick={onBack}
          type="button"
        >
          Back
        </button>
        <button
          className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={!canSave}
          onClick={handleSave}
          type="button"
        >
          {isSaving ? "Saving" : "Save mapping"}
        </button>
      </div>
    </div>
  );
}
