/**
 * @fileoverview Collects the applicant organisation details in the first vendor step.
 * @module features/vendors/application/steps/Step1OrgInfo
 */

"use client";

import { useState } from "react";
import { saveStep1Action } from "@/app/vendor/(portal)/application/actions";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import type { DraftApplicationData } from "../VendorApplicationWizard";
import { CountryCombobox, CountryMultiSelect } from "./CountryCombobox";

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
  "mt-2 h-11 w-full rounded-md border border-border px-3 text-body text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const SELECT =
  "mt-2 h-11 w-full rounded-md border border-border bg-surface px-3 text-body text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const TEXTAREA =
  "mt-2 min-h-20 w-full rounded-md border border-border px-3 py-2 text-body text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const LABEL = "block text-body font-medium text-fg";
const OPTIONAL = "ml-1 font-normal text-fg-subtle";

const CURRENT_YEAR = new Date().getFullYear();
const INCORPORATION_YEARS = Array.from(
  { length: CURRENT_YEAR - 1800 + 1 },
  (_, index) => CURRENT_YEAR - index,
);
// Sentinel stored for organisations founded before the dropdown's floor year.
const BEFORE_1800_VALUE = 1799;

export function Step1OrgInfo({
  initialData,
  onComplete,
}: {
  initialData: DraftApplicationData;
  onComplete: (applicationId: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [operatesInMultipleCountries, setOperatesInMultipleCountries] = useState(
    initialData.operatesInMultipleCountries,
  );
  const [operatingCountries, setOperatingCountries] = useState(initialData.operatingCountries);

  useUnsavedChangesWarning(dirty);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (operatesInMultipleCountries && operatingCountries.length === 0) {
      setError("Select at least one country where the organisation operates.");
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData(event.currentTarget);
      const result = await saveStep1Action(formData);
      if (!result.ok || !result.applicationId) {
        setError(result.error ?? "Could not save.");
        return;
      }
      setDirty(false);
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
        <h2 className="text-section-title text-fg">Organisation information</h2>
        <p className="mt-1 text-body text-fg-muted">
          Provide details about the organisation applying to become a credential verifier.
        </p>
      </div>

      <form className="space-y-4" onChange={() => setDirty(true)} onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="companyName">
              Company name <span className="text-danger-fg">*</span>
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
              Registration number <span className="text-danger-fg">*</span>
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
              Organisation type <span className="text-danger-fg">*</span>
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
              Industry / service category <span className="text-danger-fg">*</span>
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
              Physical address <span className="text-danger-fg">*</span>
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
          <div>
            <label className={LABEL} htmlFor="yearOfIncorporation">
              Year of incorporation <span className="text-danger-fg">*</span>
            </label>
            <select
              className={SELECT}
              defaultValue={initialData.yearOfIncorporation}
              id="yearOfIncorporation"
              name="yearOfIncorporation"
              required
            >
              <option value="">Select a year</option>
              {INCORPORATION_YEARS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
              <option value={BEFORE_1800_VALUE}>Before 1800</option>
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="city">
              City <span className="text-danger-fg">*</span>
            </label>
            <input
              className={INPUT}
              defaultValue={initialData.city}
              id="city"
              maxLength={100}
              name="city"
              required
              type="text"
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="country">
              Country <span className="text-danger-fg">*</span>
            </label>
            <CountryCombobox
              defaultValue={initialData.country}
              id="country"
              name="country"
              required
            />
          </div>
          <div className="flex items-end pb-2.5">
            <label className="flex items-center gap-2 text-body text-fg" htmlFor="operatesInMultipleCountries">
              <input
                checked={operatesInMultipleCountries}
                className="size-4 rounded border-border"
                id="operatesInMultipleCountries"
                name="operatesInMultipleCountries"
                onChange={(event) => setOperatesInMultipleCountries(event.target.checked)}
                type="checkbox"
              />
              Operates in multiple countries
            </label>
          </div>
          {operatesInMultipleCountries && (
            <div className="sm:col-span-2">
              <label className={LABEL} htmlFor="operatingCountries">
                Countries of operation <span className="text-danger-fg">*</span>
              </label>
              <CountryMultiSelect
                defaultValue={initialData.operatingCountries}
                name="operatingCountries"
                onChange={setOperatingCountries}
              />
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-body text-danger-fg">
            {error}
          </p>
        )}

        <div className="flex justify-end">
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
