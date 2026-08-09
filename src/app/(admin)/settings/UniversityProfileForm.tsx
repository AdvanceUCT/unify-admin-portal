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
              ? "rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"
              : "rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg"
          }
        >
          {state.message}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle"
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
      <span className="font-medium text-fg-muted">{label}</span>
      <input
        className="mt-1.5 h-10 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        defaultValue={defaultValue}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}
