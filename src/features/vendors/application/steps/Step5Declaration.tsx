"use client";

import { useState } from "react";
import { saveDraftStepAction } from "@/app/vendor/(portal)/application/actions";
import type { DraftApplicationData } from "../VendorApplicationWizard";

const DECLARATIONS = [
  "I confirm that all information provided in this application is accurate and complete to the best of my knowledge.",
  "I confirm that I am authorised to submit this application on behalf of the organisation named above.",
  "I agree that the organisation will handle any verified student data in accordance with applicable privacy laws and will only use it for the stated purpose.",
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
  const [checked, setChecked] = useState<boolean[]>(
    DECLARATIONS.map(() => initialData.declarationAccepted),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = checked.every(Boolean);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allChecked) {
      setError("Please accept all statements before continuing.");
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
        <h2 className="text-lg font-semibold">Declaration</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Please read and accept each of the following statements before proceeding to review.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-3">
          {DECLARATIONS.map((text, index) => (
            <label
              key={index}
              className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition ${
                checked[index]
                  ? "border-zinc-900 bg-zinc-50"
                  : "border-zinc-200 bg-white hover:border-zinc-300"
              }`}
            >
              <input
                checked={checked[index]}
                className="mt-0.5 shrink-0"
                onChange={(e) => {
                  const next = [...checked];
                  next[index] = e.target.checked;
                  setChecked(next);
                }}
                type="checkbox"
              />
              <span className="text-sm text-zinc-700">{text}</span>
            </label>
          ))}
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-between">
          <button
            className="h-11 rounded-md border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            onClick={onBack}
            type="button"
          >
            Back
          </button>
          <button
            className="h-11 rounded-md bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!allChecked || saving}
            type="submit"
          >
            {saving ? "Saving..." : "Review application"}
          </button>
        </div>
      </form>
    </div>
  );
}
