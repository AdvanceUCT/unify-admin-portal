"use client";

import { useActionState, useState } from "react";

import {
  updateSubVendorProfileAction,
  type UpdateSubVendorProfileState,
} from "./actions";

const initialState: UpdateSubVendorProfileState = {
  status: "idle",
};

type SubVendorProfile = {
  companyName: string;
  serviceCategory: string;
  locationName: string;
  locationAddress: string;
  contactPersonName: string;
  contactEmail: string;
};

export function SubVendorProfileForm({
  initialProfile,
}: {
  initialProfile: SubVendorProfile;
}) {
  const [state, formAction, isPending] = useActionState(
    updateSubVendorProfileAction,
    initialState,
  );
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [profile, setProfile] = useState(initialProfile);
  const [handledState, setHandledState] = useState(state);

  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success" && state.profile) {
      setProfile({ ...profile, ...state.profile });
      setMode("view");
    }
  }

  if (mode === "view") {
    return (
      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
        <div>
          <p className="text-sm font-medium text-zinc-500">Parent vendor</p>
          <p className="text-zinc-950">{profile.companyName || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-500">Service category</p>
          <p className="text-zinc-950">{profile.serviceCategory || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-500">Location name</p>
          <p className="text-zinc-950">{profile.locationName || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-500">Location address</p>
          <p className="text-zinc-950">{profile.locationAddress || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-500">Contact person name</p>
          <p className="text-zinc-950">{profile.contactPersonName || "-"}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-500">Contact email</p>
          <p className="text-zinc-950">{profile.contactEmail || "-"}</p>
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
          Edit location
        </button>
      </section>
    );
  }

  return (
    <form action={formAction} className="space-y-6 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="locationName">
            Location name
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            defaultValue={profile.locationName}
            id="locationName"
            name="locationName"
            required
            type="text"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="locationAddress">
            Location address
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            defaultValue={profile.locationAddress}
            id="locationAddress"
            name="locationAddress"
            type="text"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="contactPersonName">
            Contact person name
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            defaultValue={profile.contactPersonName}
            id="contactPersonName"
            name="contactPersonName"
            required
            type="text"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="contactEmail">
            Contact email
          </label>
          <input
            className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
            defaultValue={profile.contactEmail}
            id="contactEmail"
            name="contactEmail"
            required
            type="email"
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
