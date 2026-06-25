"use client";

import { useActionState } from "react";

import { submitApplicationAction, type SubmitApplicationState } from "./actions";

const initialState: SubmitApplicationState = {
  status: "idle",
};

const serviceCategories = [
  "Food",
  "Retail",
  "Transport",
  "Healthcare",
  "Education",
  "Finance",
  "Logistics",
  "Professional services",
];

const requestedScopeOptions = [
  { value: "enrollment_status", label: "Enrollment status" },
  { value: "faculty", label: "Faculty" },
  { value: "programme", label: "Programme" },
  { value: "degree", label: "Degree" },
  { value: "student_id", label: "Student ID" },
];

export function VendorApplicationForm() {
  const [state, formAction, isPending] = useActionState(
    submitApplicationAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-6 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="companyName">
            Company name
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            id="companyName"
            name="companyName"
            type="text"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="companyRegistrationNumber">
            Company registration number
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            id="companyRegistrationNumber"
            name="companyRegistrationNumber"
            type="text"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="serviceCategory">
            Service category
          </label>
          <select
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-zinc-950"
            id="serviceCategory"
            name="serviceCategory"
            required
          >
            <option value="">Select a category</option>
            {serviceCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="website">
            Website
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            id="website"
            name="website"
            type="url"
            placeholder="https://"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-zinc-700" htmlFor="description">
            Description of service
          </label>
          <textarea
            className="mt-2 min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-950"
            id="description"
            name="description"
            required
            aria-describedby="description-help"
          />
          <p id="description-help" className="mt-1 text-xs text-zinc-500">
            Describe your service in 200 words or fewer.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="contactPersonName">
            Contact person name
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            id="contactPersonName"
            name="contactPersonName"
            type="text"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="contactEmail">
            Contact email
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            id="contactEmail"
            name="contactEmail"
            type="email"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700" htmlFor="justification">
          Why should we approve you as a verifier?
        </label>
        <textarea
          className="mt-2 min-h-28 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-950"
          id="justification"
          name="justification"
          required
        />
      </div>

      <fieldset className="rounded-lg border border-zinc-200 p-4">
        <legend className="text-sm font-medium text-zinc-700">Requested credential scopes</legend>
        <p className="mt-1 text-xs text-zinc-500">Select the student data you need access to.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {requestedScopeOptions.map((option) => (
            <label key={option.value} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm transition hover:border-zinc-300">
              <input
                type="checkbox"
                name="requestedScopes"
                value={option.value}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          }
        >
          {state.message}
        </p>
      ) : null}

      <button
        className="h-11 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Submitting..." : "Submit application"}
      </button>
    </form>
  );
}
