"use client";

import { useActionState } from "react";

import {
  updateUniversityProfileAction,
  type UniversityProfileSettingsState,
} from "./actions";

const initialState: UniversityProfileSettingsState = { status: "idle" };

export function UniversityProfileForm({
  abbreviation,
  contactEmail,
  name,
  websiteUrl,
}: {
  abbreviation: string;
  contactEmail: string;
  name: string;
  websiteUrl: string;
}) {
  const [state, formAction, isPending] = useActionState(
    updateUniversityProfileAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field defaultValue={name} label="University name" name="name" required />
        <Field defaultValue={abbreviation} label="Abbreviation" name="abbreviation" required />
        <Field
          defaultValue={contactEmail}
          label="Contact email"
          name="contactEmail"
          required
          type="email"
        />
        <Field defaultValue={websiteUrl} label="Website URL" name="websiteUrl" type="url" />
      </div>
      {state.message ? (
        <p
          aria-live="polite"
          className={
            state.status === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          }
        >
          {state.message}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Field({
  defaultValue,
  label,
  name,
  required,
  type = "text",
}: {
  defaultValue: string;
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <input
        className="mt-1.5 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
        defaultValue={defaultValue}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}
