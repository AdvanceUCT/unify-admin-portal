"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BatchResetButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleReset() {
    if (!confirm("Reset all students to Pending and clear activation deliveries? This is for testing only.")) return;

    setIsPending(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/sync/reset", { method: "POST" });
      const data = await res.json();
      setMessage(data.message);
      router.refresh();
    } catch {
      setMessage("Reset failed.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="h-9 rounded-md border border-zinc-300 px-3 text-sm text-zinc-600 transition hover:border-zinc-500 hover:text-zinc-950 disabled:opacity-50"
        disabled={isPending}
        onClick={handleReset}
        type="button"
      >
        {isPending ? "Resetting..." : "Reset test data"}
      </button>
      {message && <p className="text-xs text-zinc-500">{message}</p>}
    </div>
  );
}