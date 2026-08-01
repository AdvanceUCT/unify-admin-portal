"use client";

import { useFormStatus } from "react-dom";

import { updateUniversityProfileAction } from "./actions";

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
  return (
    <form action={updateUniversityProfileAction} className="space-y-4">
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
      <div className="flex justify-end">
        <SubmitButton />
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

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving..." : "Save changes"}
    </button>
  );
}
