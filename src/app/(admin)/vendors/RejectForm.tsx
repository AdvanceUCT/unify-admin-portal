"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

export function RejectForm({
  action,
  applicationId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  applicationId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        className="h-9 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-700 hover:bg-rose-100"
        onClick={() => setExpanded(true)}
        type="button"
      >
        Reject
      </button>
    );
  }

  return (
    <form action={action} className="flex w-64 flex-col items-end gap-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <label className="w-full text-sm font-medium text-zinc-800" htmlFor={`reject-notes-${applicationId}`}>
        Reason for rejection
      </label>
      <textarea
        autoFocus
        className="min-h-24 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-950"
        id={`reject-notes-${applicationId}`}
        maxLength={500}
        name="notes"
        required
      />
      <div className="flex gap-2">
        <button
          className="h-8 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          onClick={() => setExpanded(false)}
          type="button"
        >
          Cancel
        </button>
        <RejectSubmitButton />
      </div>
    </form>
  );
}

function RejectSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="h-8 rounded-md bg-rose-700 px-3 text-xs font-medium text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Rejecting..." : "Confirm rejection"}
    </button>
  );
}
