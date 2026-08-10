"use client";

import { useState } from "react";

import { MappingStep } from "@/features/imports/steps/MappingStep";
import { PreviewStep } from "@/features/imports/steps/PreviewStep";
import { UploadStep } from "@/features/imports/steps/UploadStep";
import type { ImportFieldDefinition } from "@/lib/imports/mapping";

const steps = ["Upload", "Map columns", "Preview"] as const;

export function ImportWizard({
  existingColumnMap,
  fieldDefinitions,
}: {
  existingColumnMap: Record<string, string>;
  fieldDefinitions: ImportFieldDefinition[];
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  return (
    <div className="space-y-6">
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((label, index) => {
          const isCurrent = index === currentStep;
          const isComplete = index < currentStep;

          return (
            <li
              key={label}
              className={`rounded-lg border px-3 py-2 text-caption ${
                isCurrent
                  ? "border-brand-600 bg-surface text-fg"
                  : isComplete
                    ? "border-border bg-surface text-fg-muted"
                    : "border-border bg-surface-muted text-fg-subtle"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`grid size-6 place-items-center rounded-full text-caption font-semibold ${
                    isCurrent
                      ? "bg-brand-600 text-white"
                      : isComplete
                        ? "bg-surface-muted text-fg-muted"
                        : "bg-surface-muted text-fg-subtle"
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

      <section className="rounded-lg border border-border bg-surface p-6 shadow-md">
        {currentStep === 0 ? (
          <UploadStep
            onUploaded={(nextFile, nextColumns) => {
              setFile(nextFile);
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
            onContinue={(nextColumnMap) => {
              setColumnMap(nextColumnMap);
              setCurrentStep(2);
            }}
            onSaved={(nextColumnMap) => {
              setColumnMap(nextColumnMap);
              setSavedAt(new Date());
            }}
          />
        ) : null}
        {currentStep === 2 && file ? (
          <PreviewStep
            columns={columns}
            columnMap={columnMap}
            file={file}
            fieldDefinitions={fieldDefinitions}
            onBack={() => setCurrentStep(1)}
          />
        ) : null}
      </section>

      {currentStep === 1 && savedAt ? (
        <p className="rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg">
          Mapping saved. The next CSV upload will pre-fill these choices.
        </p>
      ) : null}
    </div>
  );
}
