"use client";

import { SendHorizontal } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import {
  submitVendorHelpRequestAction,
  type VendorHelpFormState,
} from "./actions";

const initialState: VendorHelpFormState = {
  status: "idle",
};

const inputClassName =
  "mt-1.5 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle";
const textareaClassName =
  "mt-1.5 min-h-44 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle";

export function VendorHelpForm({
  supportEmail,
}: {
  supportEmail?: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    submitVendorHelpRequestAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-xl border border-border bg-surface p-5 shadow-md"
      ref={formRef}
    >
      <div>
        <h2 className="text-section-title text-fg">Contact university support</h2>
        {supportEmail ? (
          <p className="mt-1 text-sm text-fg-muted">
            Messages are sent to {supportEmail}.
          </p>
        ) : null}
      </div>

      <div>
        <label
          className="block text-sm font-medium text-fg-muted"
          htmlFor="title"
        >
          Title
        </label>
        <input
          className={inputClassName}
          disabled={isPending}
          id="title"
          maxLength={160}
          name="title"
          required
          type="text"
        />
      </div>

      <div>
        <label
          className="block text-sm font-medium text-fg-muted"
          htmlFor="details"
        >
          Details
        </label>
        <textarea
          className={textareaClassName}
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
              ? "rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"
              : "rounded-md border border-success-border bg-success-bg px-3 py-2 text-sm text-success-fg"
          }
        >
          {state.message}
        </p>
      ) : null}

      <button
        className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-subtle"
        disabled={isPending}
        type="submit"
      >
        <SendHorizontal size={16} aria-hidden="true" />
        {isPending ? "Sending..." : "Submit request"}
      </button>
    </form>
  );
}
