"use client";

import { SendHorizontal } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { submitVendorHelpRequestAction, type VendorHelpFormState } from "./actions";

const initialState: VendorHelpFormState = {
  status: "idle",
};

export function VendorHelpForm({ supportEmail }: { supportEmail?: string | null }) {
  const [state, formAction, isPending] = useActionState(submitVendorHelpRequestAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-6 rounded-lg border border-zinc-200 bg-white p-5" ref={formRef}>
      <div>
        <h2 className="font-medium text-zinc-950">Contact university support</h2>
        {supportEmail ? <p className="mt-1 text-sm text-zinc-500">Messages are sent to {supportEmail}.</p> : null}
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700" htmlFor="title">
          Title
        </label>
        <input
          className="mt-2 h-11 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none transition focus:border-zinc-950"
          disabled={isPending}
          id="title"
          maxLength={160}
          name="title"
          required
          type="text"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700" htmlFor="details">
          Details
        </label>
        <textarea
          className="mt-2 min-h-44 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-zinc-950"
          disabled={isPending}
          id="details"
          maxLength={5000}
          name="details"
          required
        />
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
        className="inline-flex h-11 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        <SendHorizontal size={16} aria-hidden="true" />
        {isPending ? "Sending..." : "Submit request"}
      </button>
    </form>
  );
}
