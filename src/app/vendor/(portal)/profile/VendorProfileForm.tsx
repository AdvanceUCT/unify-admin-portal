/**
 * @fileoverview Owns the Vendor Profile Form fields, validation state, and submission feedback.
 * @module app/vendor/(portal)/profile/VendorProfileForm
 */

"use client";

import { useActionState, useState } from "react";

import { SERVICE_CATEGORIES } from "@/lib/vendors/constants";

import { updateVendorProfileAction, type UpdateProfileState } from "./actions";

const initialState: UpdateProfileState = {
  status: "idle",
};

type VendorProfile = {
  companyName: string;
  serviceCategory: string;
  contactPersonName: string;
  contactEmail: string;
};

type VendorProfileFormProps = {
  initialProfile: VendorProfile;
};

const inputClassName =
  "mt-1.5 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const labelClassName = "block text-sm font-medium text-fg-muted";

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <p className="text-sm font-medium text-fg-subtle">{label}</p>
      <p className="mt-0.5 font-medium text-fg">{value || "-"}</p>
    </div>
  );
}

export function VendorProfileForm({ initialProfile }: VendorProfileFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateVendorProfileAction,
    initialState,
  );
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [profile, setProfile] = useState(initialProfile);
  const [handledState, setHandledState] = useState(state);

  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success" && state.profile) {
      setProfile(state.profile);
      setMode("view");
    }
  }

  if (mode === "view") {
    return (
      <section className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-md">
        <div className="divide-y divide-border">
          <ProfileField label="Company name" value={profile.companyName} />
          <ProfileField label="Service category" value={profile.serviceCategory} />
          <ProfileField
            label="Contact person name"
            value={profile.contactPersonName}
          />
          <ProfileField label="Contact email" value={profile.contactEmail} />
        </div>

        {state.message ? (
          <p className="rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg">
            {state.message}
          </p>
        ) : null}

        <button
          className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700"
          onClick={() => setMode("edit")}
          type="button"
        >
          Edit profile
        </button>
      </section>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-xl border border-border bg-surface p-5 shadow-md"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClassName} htmlFor="companyName">
            Company name
          </label>
          <input
            className={inputClassName}
            id="companyName"
            name="companyName"
            type="text"
            defaultValue={profile.companyName}
            required
          />
        </div>

        <div>
          <label className={labelClassName} htmlFor="serviceCategory">
            Service category
          </label>
          <select
            className={inputClassName}
            id="serviceCategory"
            name="serviceCategory"
            defaultValue={profile.serviceCategory}
            required
          >
            <option value="">Select a category</option>
            {SERVICE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClassName} htmlFor="contactPersonName">
            Contact person name
          </label>
          <input
            className={inputClassName}
            id="contactPersonName"
            name="contactPersonName"
            type="text"
            defaultValue={profile.contactPersonName}
            required
          />
        </div>

        <div>
          <label className={labelClassName} htmlFor="contactEmail">
            Contact email
          </label>
          <input
            className={inputClassName}
            id="contactEmail"
            name="contactEmail"
            type="email"
            defaultValue={profile.contactEmail}
            required
          />
        </div>
      </div>

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"
              : "rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg"
          }
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          className="h-10 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Saving..." : "Save changes"}
        </button>
        <button
          className="h-10 rounded-md border border-border bg-surface px-4 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          onClick={() => setMode("view")}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
