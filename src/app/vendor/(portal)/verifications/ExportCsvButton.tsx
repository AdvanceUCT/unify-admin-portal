"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";

/**
 * A plain `<a href>` gives no feedback while the export is generating, so
 * this fetches the CSV itself and triggers the download from the resulting
 * blob once it arrives — same download-from-blob technique as
 * `QrCodeActions.tsx`.
 */
export function ExportCsvButton({ href }: { href: string }) {
  const [isPending, setIsPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    setIsPending(true);
    setFailed(false);
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const filenameMatch = /filename="?([^"]+)"?/.exec(response.headers.get("Content-Disposition") ?? "");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameMatch?.[1] ?? "verification-events.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setFailed(true);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {failed && <span className="text-xs text-danger-fg">Export failed, try again</span>}
      <button
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        onClick={handleClick}
        type="button"
      >
        {isPending ? <Loader2 aria-hidden="true" className="animate-spin" size={14} /> : <Download aria-hidden="true" size={14} />}
        {isPending ? "Exporting..." : "Export CSV"}
      </button>
    </div>
  );
}
