"use client";

import { useState } from "react";
import { saveStep1Action } from "@/app/vendor/(portal)/application/actions";
import type { DraftApplicationData } from "../VendorApplicationWizard";

const SERVICE_CATEGORIES = [
  "Food",
  "Retail",
  "Transport",
  "Healthcare",
  "Education",
  "Finance",
  "Logistics",
  "Professional services",
];

const ORGANISATION_TYPES = [
  "Public company",
  "Private company",
  "Non-profit organisation",
  "Government entity",
  "Educational institution",
  "Sole proprietor",
  "Other",
];

const INPUT =
  "mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950";
const SELECT =
  "mt-2 h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950";
const TEXTAREA =
  "mt-2 min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-950";
const LABEL = "block text-sm font-medium text-zinc-700";
const OPTIONAL = "ml-1 font-normal text-zinc-400";

export function Step1OrgInfo({
  initialData,
  onComplete,
}: {
  initialData: DraftApplicationData;
  onComplete: (applicationId: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const formData = new FormData(event.currentTarget);
      const result = await saveStep1Action(formData);
      if (!result.ok || !result.applicationId) {
        setError(result.error ?? "Could not save.");
        return;
      }
      onComplete(result.applicationId);
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Organisation information</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Provide details about the organisation applying to become a credential verifier.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="companyName">
              Company name <span className="text-red-500">*</span>
            </label>
            <input
              className={INPUT}
              defaultValue={initialData.companyName}
              id="companyName"
              maxLength={200}
              name="companyName"
              required
              type="text"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="tradingName">
              Trading name <span className={OPTIONAL}>(if different)</span>
            </label>
            <input
              className={INPUT}
              defaultValue={initialData.tradingName}
              id="tradingName"
              maxLength={200}
              name="tradingName"
              type="text"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="companyRegistrationNumber">
              Registration number <span className="text-red-500">*</span>
            </label>
            <input
              className={INPUT}
              defaultValue={initialData.companyRegistrationNumber}
              id="companyRegistrationNumber"
              inputMode="numeric"
              maxLength={14}
              name="companyRegistrationNumber"
              onInput={(event) => {
                const isDeleting = (event.nativeEvent as InputEvent).inputType?.startsWith("delete") ?? false;
                const digits = event.currentTarget.value.replace(/\D/g, "").slice(0, 12);
                const [year, sequence, check] = [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 12)];

                let formatted = year;
                if (sequence || (digits.length >= 4 && !isDeleting)) formatted += `/${sequence}`;
                if (check || (digits.length >= 10 && !isDeleting)) formatted += `/${check}`;

                event.currentTarget.value = formatted;
              }}
              pattern="\d{4}/\d{6}/\d{2}"
              placeholder="2020/123456/07"
              required
              title="Format: YYYY/NNNNNN/NN"
              type="text"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="organisationType">
              Organisation type <span className="text-red-500">*</span>
            </label>
            <select
              className={SELECT}
              defaultValue={initialData.organisationType}
              id="organisationType"
              name="organisationType"
              required
            >
              <option value="">Select a type</option>
              {ORGANISATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="serviceCategory">
              Industry / service category <span className="text-red-500">*</span>
            </label>
            <select
              className={SELECT}
              defaultValue={initialData.serviceCategory}
              id="serviceCategory"
              name="serviceCategory"
              required
            >
              <option value="">Select a category</option>
              {SERVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="website">
              Website <span className={OPTIONAL}>(optional)</span>
            </label>
            <input
              className={INPUT}
              defaultValue={initialData.website}
              id="website"
              name="website"
              placeholder="https://"
              type="url"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="physicalAddress">
              Physical address <span className="text-red-500">*</span>
            </label>
            <textarea
              className={TEXTAREA}
              defaultValue={initialData.physicalAddress}
              id="physicalAddress"
              maxLength={500}
              name="physicalAddress"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="postalAddress">
              Postal address <span className={OPTIONAL}>(if different)</span>
            </label>
            <textarea
              className={TEXTAREA}
              defaultValue={initialData.postalAddress}
              id="postalAddress"
              maxLength={500}
              name="postalAddress"
            />
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end">
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
