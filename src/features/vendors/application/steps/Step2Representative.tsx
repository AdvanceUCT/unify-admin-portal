/**
 * @fileoverview Collects the vendor representative and contact details.
 * @module features/vendors/application/steps/Step2Representative
 */

"use client";

import { useState } from "react";
import { saveDraftStepAction } from "@/app/vendor/(portal)/application/actions";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import type { DraftApplicationData } from "../VendorApplicationWizard";

const INPUT =
  "mt-2 h-11 w-full rounded-md border border-border px-3 text-body text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const LABEL = "block text-body font-medium text-fg";
const OPTIONAL = "ml-1 font-normal text-fg-subtle";

export function Step2Representative({
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
  const [dirty, setDirty] = useState(false);

  useUnsavedChangesWarning(dirty);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const formData = new FormData(event.currentTarget);
      formData.append("applicationId", applicationId);
      formData.append("step", "2");
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
        <h2 className="text-section-title text-fg">Authorised representative</h2>
        <p className="mt-1 text-body text-fg-muted">
          Provide details of the person authorised to submit this application on behalf of the
          organisation.
        </p>
      </div>

      <form className="space-y-4" onChange={() => setDirty(true)} onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="contactPersonName">
              Full name <span className="text-danger-fg">*</span>
            </label>
            <input
              className={INPUT}
              defaultValue={initialData.contactPersonName}
              id="contactPersonName"
              maxLength={200}
              name="contactPersonName"
              required
              type="text"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="contactEmail">
              Work email <span className="text-danger-fg">*</span>
            </label>
            <input
              className={INPUT}
              defaultValue={initialData.contactEmail}
              id="contactEmail"
              maxLength={254}
              name="contactEmail"
              required
              type="email"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="contactJobTitle">
              Job title <span className="text-danger-fg">*</span>
            </label>
            <input
              className={INPUT}
              defaultValue={initialData.contactJobTitle}
              id="contactJobTitle"
              maxLength={150}
              name="contactJobTitle"
              required
              type="text"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="contactPhone">
              Phone number <span className="text-danger-fg">*</span>
            </label>
            <input
              className={INPUT}
              defaultValue={initialData.contactPhone}
              id="contactPhone"
              inputMode="numeric"
              maxLength={10}
              name="contactPhone"
              onInput={(event) => {
                event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 10);
              }}
              pattern="0[0-9]{9}"
              placeholder="0821234567"
              required
              title="Enter a valid South African cell number: 10 digits, starting with 0"
              type="tel"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="contactEmployeeNumber">
              Employee number <span className={OPTIONAL}>(optional)</span>
            </label>
            <input
              className={INPUT}
              defaultValue={initialData.contactEmployeeNumber}
              id="contactEmployeeNumber"
              maxLength={50}
              name="contactEmployeeNumber"
              type="text"
            />
          </div>
          <div>
            <fieldset>
              <legend className={LABEL}>
                Preferred contact method <span className="text-danger-fg">*</span>
              </legend>
              <div className="mt-3 flex gap-6">
                {(["email", "phone"] as const).map((method) => (
                  <label key={method} className="flex items-center gap-2 text-body text-fg">
                    <input
                      className="accent-brand-600"
                      defaultChecked={initialData.preferredContactMethod === method}
                      name="preferredContactMethod"
                      required
                      type="radio"
                      value={method}
                    />
                    <span className="capitalize">{method}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
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
