/**
 * @fileoverview Provides the shared Logo Upload UI primitive used across portal screens.
 * @module components/ui/LogoUpload
 */

"use client";

import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";

import { Dialog } from "@/components/ui/Dialog";
import { toSafeImageSrc } from "@/lib/url";

type LogoActionResult = { ok: boolean; error?: string };
type Status = "idle" | "uploading" | "removing";

type LogoUploadProps = {
  initialLogoUrl: string | null;
  uploadAction: (formData: FormData) => Promise<LogoActionResult>;
  removeAction: () => Promise<LogoActionResult>;
  alt?: string;
  removeDialogTitle?: string;
  removeDialogDescription?: string;
};

export function LogoUpload({
  initialLogoUrl,
  uploadAction,
  removeAction,
  alt = "Organisation logo",
  removeDialogTitle = "Remove logo?",
  removeDialogDescription = "This portal will fall back to the default icon until you upload a new one.",
}: LogoUploadProps) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const objectUrlRef = useRef<string | null>(null);
  const router = useRouter();
  const safeLogoSrc = toSafeImageSrc(logoUrl);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const result = await uploadAction(formData);
      if (result.ok) {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = URL.createObjectURL(file);
        setLogoUrl(objectUrlRef.current);
        router.refresh();
      } else {
        setError(result.error ?? "Upload failed. Please try again.");
      }
    } catch {
      setError("Something went wrong while uploading. Please try again.");
    } finally {
      setStatus("idle");
    }

    event.target.value = "";
  }

  async function handleRemove() {
    setConfirmOpen(false);
    setStatus("removing");
    setError(null);

    try {
      const result = await removeAction();
      if (result.ok) {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
        setLogoUrl(null);
        router.refresh();
      } else {
        setError(result.error ?? "Could not remove the logo.");
      }
    } catch {
      setError("Something went wrong while removing the logo. Please try again.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-muted">
        {safeLogoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed/blob URLs aren't compatible with next/image
          <img alt={alt} className="size-full object-contain" src={safeLogoSrc} />
        ) : (
          <Building2 className="size-6 text-fg-subtle" aria-hidden="true" />
        )}
      </div>

      <div>
        <div className="flex items-center gap-2">
          <label
            className={`inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-xs font-medium transition ${
              status !== "idle"
                ? "cursor-not-allowed border-border bg-surface-muted text-fg-subtle"
                : "border-border bg-surface text-fg-muted hover:border-border-strong hover:bg-surface-muted hover:text-fg"
            }`}
          >
            {status === "uploading" ? "Uploading..." : logoUrl ? "Replace" : "Upload logo"}
            <input
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={status !== "idle"}
              onChange={handleFileChange}
              type="file"
            />
          </label>
          {logoUrl ? (
            <button
              className="inline-flex h-9 items-center rounded-md border border-danger-border bg-danger-bg px-3 text-xs font-medium text-danger-fg transition hover:bg-danger-border disabled:cursor-not-allowed disabled:opacity-60"
              disabled={status !== "idle"}
              onClick={() => setConfirmOpen(true)}
              type="button"
            >
              {status === "removing" ? "Removing..." : "Remove"}
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-fg-subtle">PNG, JPEG, or WEBP. Max 2 MB.</p>
        {error ? <p className="mt-1 text-xs text-danger-fg">{error}</p> : null}
      </div>

      <Dialog isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title={removeDialogTitle}>
        <p>{removeDialogDescription}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted hover:border-border-strong hover:bg-surface-muted hover:text-fg"
            onClick={() => setConfirmOpen(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-9 rounded-md bg-danger-fg px-3 text-sm font-medium text-white hover:opacity-90"
            onClick={handleRemove}
            type="button"
          >
            Remove logo
          </button>
        </div>
      </Dialog>
    </div>
  );
}
