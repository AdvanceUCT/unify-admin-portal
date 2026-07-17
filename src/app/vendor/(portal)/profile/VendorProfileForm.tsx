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
      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <div>
          <p className="text-sm font-medium text-zinc-500">Company name</p>
          <p className="text-zinc-950">{profile.companyName || "—"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-500">Service category</p>
          <p className="text-zinc-950">{profile.serviceCategory || "—"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-500">Contact person name</p>
          <p className="text-zinc-950">{profile.contactPersonName || "—"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-500">Contact email</p>
          <p className="text-zinc-950">{profile.contactEmail || "—"}</p>
        </div>

        {state.message ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {state.message}
          </p>
        ) : null}

        <button
          className="h-11 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
          onClick={() => setMode("edit")}
          type="button"
        >
          Edit profile
        </button>
      </section>
    );
  }

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
            defaultValue={profile.companyName}
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
          <label className="block text-sm font-medium text-zinc-700" htmlFor="contactPersonName">
            Contact person name
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            id="contactPersonName"
            name="contactPersonName"
            type="text"
            defaultValue={profile.contactPersonName}
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
            defaultValue={profile.contactEmail}
            required
          />
        </div>
      </div>

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

      <div className="flex gap-3">
        <button
          className="h-11 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Saving..." : "Save changes"}
        </button>
        <button
          className="h-11 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
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
