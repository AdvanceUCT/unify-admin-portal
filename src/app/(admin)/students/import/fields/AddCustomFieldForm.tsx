"use client";

import { useActionState, useState } from "react";

import { slugifyToFieldKey } from "@/lib/imports/types";
import { addCustomFieldAction, type AddCustomFieldState } from "./actions";

const initialState: AddCustomFieldState = { status: "idle" };

export function AddCustomFieldForm() {
  const [state, formAction, isPending] = useActionState(addCustomFieldAction, initialState);
  const [label, setLabel] = useState("");

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
      <div className="max-w-sm">
        <label className="block text-sm font-medium text-zinc-700" htmlFor="label">
          Label
        </label>
        <input
          className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
          id="label"
          name="label"
          onChange={(event) => setLabel(event.target.value)}
          required
          value={label}
        />
      </div>

      <input name="key" type="hidden" value={slugifyToFieldKey(label)} />

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
        {isPending ? "Adding field..." : "Add custom field"}
      </button>
    </form>
  );
}
