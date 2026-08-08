"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Trash2, X } from "lucide-react";

import { removeLogoAction, uploadLogoAction } from "@/app/vendor/(portal)/profile/actions";
import { toSafeImageSrc } from "@/lib/url";

type Status = "idle" | "uploading" | "removing";

export function VendorLogoUpload({ initialLogoUrl }: { initialLogoUrl: string | null }) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const objectUrlRef = useRef<string | null>(null);
  const router = useRouter();
  const safeLogoSrc = toSafeImageSrc(logoUrl);

  useEffect(() => {
    if (!confirmOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [confirmOpen]);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const result = await uploadLogoAction(formData);
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
      const result = await removeLogoAction();
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
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
        {safeLogoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed/blob URLs aren't compatible with next/image
          <img alt="Organisation logo" className="size-full object-contain" src={safeLogoSrc} />
        ) : (
          <Building2 className="size-6 text-zinc-300" aria-hidden="true" />
        )}
      </div>

      <div>
        <div className="flex items-center gap-2">
          <label
            className={`inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-xs font-medium transition ${
              status !== "idle"
                ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
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
              className="inline-flex h-9 items-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={status !== "idle"}
              onClick={() => setConfirmOpen(true)}
              type="button"
            >
              {status === "removing" ? "Removing..." : "Remove"}
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-zinc-500">PNG, JPEG, or WEBP. Max 2 MB.</p>
        {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      </div>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmOpen(false);
          }}
        >
          <div
            aria-describedby="remove-logo-description"
            aria-labelledby="remove-logo-title"
            aria-modal="true"
            className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white shadow-xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
              <div className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-red-50 text-red-700">
                  <Trash2 className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 id="remove-logo-title" className="font-semibold text-zinc-950">
                    Remove organisation logo?
                  </h2>
                  <p id="remove-logo-description" className="mt-1 text-sm text-zinc-600">
                    Your profile and dashboard will fall back to the default icon until you upload a new one.
                  </p>
                </div>
              </div>
              <button
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                onClick={() => setConfirmOpen(false)}
                type="button"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                onClick={() => setConfirmOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="h-9 rounded-md bg-red-700 px-3 text-sm font-medium text-white hover:bg-red-800"
                onClick={handleRemove}
                type="button"
              >
                Remove logo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
