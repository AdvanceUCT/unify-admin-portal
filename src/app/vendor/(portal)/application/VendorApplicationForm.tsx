"use client";

import { useActionState } from "react";

import { submitApplicationAction, type SubmitApplicationState } from "./actions";

const initialState: SubmitApplicationState = {
  status: "idle",
};

export function VendorApplicationForm() {
  const [state, formAction, isPending] = useActionState(
    submitApplicationAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
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

      <div>
        <label className="block text-sm font-medium text-zinc-700" htmlFor="requestedScopes">
          Requested credential scopes
        </label>
        <input
          className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
          id="requestedScopes"
          name="requestedScopes"
          placeholder="degree, transcript"
        />
        <p className="mt-1 text-xs text-zinc-500">Comma-separated.</p>
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
