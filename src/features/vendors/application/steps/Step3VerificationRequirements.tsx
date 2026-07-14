"use client";

import { useState } from "react";
import { saveDraftStepAction } from "@/app/vendor/(portal)/application/actions";
import type { DraftApplicationData } from "../VendorApplicationWizard";

const TEXTAREA =
  "mt-2 min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-950";
const LABEL = "block text-sm font-medium text-zinc-700";
const OPTIONAL = "ml-1 font-normal text-zinc-400";

const SCOPES = [
  { key: "studentNumber", label: "Student number" },
  { key: "faculty", label: "Faculty" },
  { key: "year", label: "Year of study" },
] as const;

export function Step3VerificationRequirements({
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const formData = new FormData(event.currentTarget);
      formData.append("applicationId", applicationId);
      formData.append("step", "3");
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
        <h2 className="text-lg font-semibold">Verification requirements</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Explain how you intend to use student credential verification and what attributes you
          need access to.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className={LABEL} htmlFor="justification">
            Purpose for requesting verification access <span className="text-red-500">*</span>
          </label>
          <textarea
            className={TEXTAREA}
            defaultValue={initialData.justification}
            id="justification"
            name="justification"
            placeholder="Describe why your organisation needs to verify student credentials."
            required
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="description">
            Intended use of credential verification <span className="text-red-500">*</span>
          </label>
          <textarea
            className={TEXTAREA}
            defaultValue={initialData.description}
            id="description"
            name="description"
            placeholder="Describe how verified credentials will be used in your service or process."
            required
          />
          <p className="mt-1 text-xs text-zinc-500">200 words or fewer.</p>
        </div>

        <div>
          <label className={LABEL} htmlFor="additionalInfo">
            Additional information <span className={OPTIONAL}>(optional)</span>
          </label>
          <textarea
            className="mt-2 min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-950"
            defaultValue={initialData.additionalInfo}
            id="additionalInfo"
            name="additionalInfo"
            placeholder="Anything else the university should know about your application."
          />
        </div>

        <fieldset>
          <legend className={`${LABEL} mb-3`}>
            Verification scopes <span className="text-red-500">*</span>
          </legend>
          <p className="mb-3 text-sm text-zinc-500">
            Select the student credential attributes your organisation needs to verify.
          </p>
          <div className="space-y-2">
            {SCOPES.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 text-sm">
                <input
                  defaultChecked={initialData.requestedScopes.includes(key)}
                  name="requestedScopes"
                  type="checkbox"
                  value={key}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

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
            disabled={saving}
            type="submit"
          >
            {saving ? "Saving..." : "Save and continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
