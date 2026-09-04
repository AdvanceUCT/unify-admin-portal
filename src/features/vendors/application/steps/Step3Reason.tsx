/**
 * @fileoverview Captures why a vendor is applying for credential verification access.
 * @module features/vendors/application/steps/Step3Reason
 */

"use client";

import { useState } from "react";
import { saveDraftStepAction } from "@/app/vendor/(portal)/application/actions";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import {
  APPLICATION_REASONS,
  OTHER_APPLICATION_REASON_VALUE,
} from "@/lib/vendors/application-reasons";
import type { DraftApplicationData } from "../VendorApplicationWizard";

const TEXTAREA =
  "mt-2 min-h-28 w-full rounded-md border border-border px-3 py-2 text-body text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const LABEL = "block text-body font-medium text-fg";
const OPTIONAL = "ml-1 font-normal text-fg-subtle";

export function Step3Reason({
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
  const [showOtherInput, setShowOtherInput] = useState(
    initialData.applicationReasons.includes(OTHER_APPLICATION_REASON_VALUE),
  );
  const [dirty, setDirty] = useState(false);

  useUnsavedChangesWarning(dirty);

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
      setDirty(false);
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
        <h2 className="text-section-title text-fg">Reason for application</h2>
        <p className="mt-1 text-body text-fg-muted">
          Select every reason your organisation needs access to student credential verification.
        </p>
      </div>

      <form className="space-y-4" onChange={() => setDirty(true)} onSubmit={handleSubmit}>
        <fieldset>
          <legend className={LABEL}>
            Reason for requesting verification access <span className="text-danger-fg">*</span>
          </legend>
          <div className="mt-2 divide-y divide-border rounded-md border border-border">
            {APPLICATION_REASONS.map((reason) => (
              <label
                key={reason.value}
                className="flex items-center gap-3 px-3 py-2.5 text-body text-fg-muted"
              >
                <input
                  className="accent-brand-600"
                  defaultChecked={initialData.applicationReasons.includes(reason.value)}
                  name="applicationReasons"
                  onChange={
                    reason.value === OTHER_APPLICATION_REASON_VALUE
                      ? (event) => setShowOtherInput(event.currentTarget.checked)
                      : undefined
                  }
                  type="checkbox"
                  value={reason.value}
                />
                {reason.label}
              </label>
            ))}
          </div>
        </fieldset>

        {showOtherInput && (
          <div>
            <label className={LABEL} htmlFor="otherApplicationReason">
              Please describe your other reason <span className="text-danger-fg">*</span>
            </label>
            <input
              className="mt-2 h-11 w-full rounded-md border border-border px-3 text-body text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              defaultValue={initialData.otherApplicationReason}
              id="otherApplicationReason"
              maxLength={500}
              name="otherApplicationReason"
              required={showOtherInput}
              type="text"
            />
          </div>
        )}

        <div>
          <label className={LABEL} htmlFor="additionalInfo">
            Additional information <span className={OPTIONAL}>(optional)</span>
          </label>
          <textarea
            className={TEXTAREA}
            defaultValue={initialData.additionalInfo}
            id="additionalInfo"
            maxLength={2000}
            name="additionalInfo"
            placeholder="Please provide additional information about how you intend to use the verification service."
          />
        </div>

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
