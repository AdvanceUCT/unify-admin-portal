"use client";

import { useState } from "react";

export function RejectForm({
  action,
  applicationId,
}: {
  action: (formData: FormData) => void;
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
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <textarea
        autoFocus
        className="w-64 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        name="notes"
        placeholder="Reason for rejection…"
        required
        rows={3}
      />
      <div className="flex gap-2">
        <button
          className="h-8 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          onClick={() => setExpanded(false)}
          type="button"
        >
          Cancel
        </button>
        <button
          className="h-8 rounded-md border border-rose-200 bg-rose-50 px-3 text-xs font-medium text-rose-700 hover:bg-rose-100"
          type="submit"
        >
          Confirm rejection
        </button>
      </div>
    </form>
  );
}
