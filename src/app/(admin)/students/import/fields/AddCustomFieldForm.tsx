/**
 * @fileoverview Owns the Add Custom Field Form fields, validation state, and submission feedback.
 * @module app/(admin)/students/import/fields/AddCustomFieldForm
 */

"use client";

import { useActionState, useState } from "react";

import { slugifyToFieldKey } from "@/lib/imports/types";
import { addCustomFieldAction, type AddCustomFieldState } from "./actions";

const initialState: AddCustomFieldState = { status: "idle" };

export function AddCustomFieldForm() {
  const [state, formAction, isPending] = useActionState(addCustomFieldAction, initialState);
  const [label, setLabel] = useState("");

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-border bg-surface p-5 shadow-md">
      <div className="max-w-sm">
        <label className="block text-sm font-medium text-fg" htmlFor="label">
          Label
        </label>
        <input
          className="mt-2 h-11 w-full rounded-md border border-border px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
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
              ? "rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"
              : "rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg"
          }
        >
          {state.message}
        </p>
      ) : null}

      <button
        className="h-11 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Adding field..." : "Add custom field"}
      </button>
    </form>
  );
}
