"use client";

import { useState } from "react";

import { MappingStep } from "@/features/imports/steps/MappingStep";
import { UploadStep } from "@/features/imports/steps/UploadStep";
import type { ImportFieldDefinition } from "@/lib/imports/mapping";

const steps = ["Upload", "Map columns"] as const;

export function ImportWizard({
  existingColumnMap,
  fieldDefinitions,
}: {
  existingColumnMap: Record<string, string>;
  fieldDefinitions: ImportFieldDefinition[];
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [columns, setColumns] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  return (
    <div className="space-y-6">
      <ol className="grid gap-2 sm:grid-cols-2">
        {steps.map((label, index) => {
          const isCurrent = index === currentStep;
          const isComplete = index < currentStep;

          return (
            <li
              key={label}
              className={`rounded-lg border px-3 py-2 text-sm ${
                isCurrent
                  ? "border-zinc-900 bg-white text-zinc-950"
                  : isComplete
                    ? "border-zinc-200 bg-white text-zinc-600"
                    : "border-zinc-200 bg-zinc-50 text-zinc-400"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${
                    isCurrent
                      ? "bg-zinc-900 text-white"
                      : isComplete
                        ? "bg-zinc-200 text-zinc-700"
                        : "bg-zinc-100 text-zinc-400"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="font-medium">{label}</span>
              </div>
            </li>
          );
        })}
      </ol>

      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        {currentStep === 0 ? (
          <UploadStep
            onUploaded={(nextColumns) => {
              setColumns(nextColumns);
              setSavedAt(null);
              setCurrentStep(1);
            }}
          />
        ) : null}
        {currentStep === 1 ? (
          <MappingStep
            columns={columns}
            existingColumnMap={existingColumnMap}
            fieldDefinitions={fieldDefinitions}
            onBack={() => setCurrentStep(0)}
            onSaved={() => setSavedAt(new Date())}
          />
        ) : null}
      </section>

      {savedAt ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Mapping saved. The next CSV upload will pre-fill these choices.
        </p>
      ) : null}
    </div>
  );
}
