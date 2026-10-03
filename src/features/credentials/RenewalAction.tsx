"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";

export function RenewalAction({
  id,
  action,
  label,
}: {
  id: string;
  action: "cancel" | "retry" | "replace";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const close = () => {
    if (!busy) {
      setOpen(false);
      setError("");
    }
  };
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/credentials/renewals/${encodeURIComponent(id)}/${action}`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message ?? "Action failed.");
      setOpen(false);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        disabled={busy}
        className="inline-flex min-h-9 items-center justify-center rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg disabled:opacity-50"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <Dialog
        isOpen={open}
        onClose={close}
        title={action === "cancel" ? "Cancel auto-renewal?" : `${label}?`}
      >
        <div className="space-y-4">
          <p className="text-sm">
            {action === "cancel"
              ? "Stop future renewal offers for this student. Already created offers and credentials keep their validity."
              : action === "replace"
                ? "Prepare a new offer for this academic year and supersede the expired activation offer. Delivery resumes on the next daily run."
                : "Resume this renewal on the next daily run using the same prepared offer."}
          </p>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg"
            >
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={close}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-fg-muted transition hover:bg-surface-muted disabled:opacity-50"
            >
              {action === "cancel" ? "Keep auto-renewal" : "Cancel"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={confirm}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${action === "cancel" ? "bg-danger-fg hover:opacity-90" : "bg-brand-600 hover:bg-brand-700"}`}
            >
              {busy && (
                <LoaderCircle aria-hidden className="size-4 animate-spin" />
              )}
              {busy
                ? "Saving..."
                : action === "cancel"
                  ? "Confirm cancellation"
                  : "Confirm and continue"}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
