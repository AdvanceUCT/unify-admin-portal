/**
 * @fileoverview Records the applicant's declaration before submission.
 * @module features/vendors/application/steps/Step5Declaration
 */

"use client";

import { useState } from "react";
import { saveDraftStepAction } from "@/app/vendor/(portal)/application/actions";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import type { DraftApplicationData } from "../VendorApplicationWizard";

const DECLARATIONS = [
  "All information provided in this application is accurate and complete to the best of my knowledge.",
  "I am authorised to submit this application on behalf of the organisation named above.",
  "The organisation will handle any verified student data in accordance with applicable privacy laws and will only use it for the stated purpose.",
];

export function Step5Declaration({
  applicationId,
  initialData,
  onComplete,
  onBack,
}: {
  applicationId: string;
  initialData: DraftApplicationData;
  onComplete: () => void;
  onBack: () => void;
}) {
  const [accepted, setAccepted] = useState(initialData.declarationAccepted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useUnsavedChangesWarning(accepted !== initialData.declarationAccepted);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accepted) {
      setError("Please accept the declaration before continuing.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("applicationId", applicationId);
      formData.append("step", "5");
      formData.append("declarationAccepted", "on");
      const result = await saveDraftStepAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Could not save.");
        return;
      }
      onComplete();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-section-title text-fg">Declaration</h2>
        <p className="mt-1 text-body text-fg-muted">
          Please read the following statements carefully before accepting.
        </p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <ul className="space-y-3 rounded-lg border border-border bg-surface-muted p-4">
          {DECLARATIONS.map((text, index) => (
            <li key={index} className="flex gap-3 text-body text-fg-muted">
              <span className="mt-0.5 shrink-0 font-medium text-fg-subtle">{index + 1}.</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            checked={accepted}
            className="mt-0.5 shrink-0 accent-brand-600"
            onChange={(e) => setAccepted(e.target.checked)}
            type="checkbox"
          />
          <span className="text-body font-medium text-fg">
            I confirm that I have read and agree to all of the above statements.
          </span>
        </label>

        {error && (
          <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-body text-danger-fg">
            {error}
          </p>
        )}

        <div className="flex justify-between">
          <button
            className="h-11 rounded-md border border-border px-5 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted"
            onClick={onBack}
            type="button"
          >
            Back
          </button>
          <button
            className="h-11 rounded-md bg-brand-600 px-5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!accepted || saving}
            type="submit"
          >
            {saving ? "Saving..." : "Review application"}
          </button>
        </div>
      </form>
    </div>
  );
}
