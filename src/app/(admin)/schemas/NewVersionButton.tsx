"use client";

import { Layers, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

export function NewVersionButton({
  action,
  currentVersion,
  currentAttributes,
}: {
  action: (formData: FormData) => void | Promise<void>;
  currentVersion: string;
  currentAttributes: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      await action(formData);
      setIsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create schema version.");
    }
  }

  return (
    <>
      <button
        className="h-9 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        Create new version
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <div
            aria-describedby="new-schema-version-description"
            aria-labelledby="new-schema-version-title"
            aria-modal="true"
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
              <div className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700">
                  <Layers className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 id="new-schema-version-title" className="font-semibold text-zinc-950">
                    Create new schema version
                  </h2>
                  <p id="new-schema-version-description" className="mt-1 text-sm text-zinc-600">
                    Credentials already issued on version {currentVersion} stay valid — the new
                    version only applies going forward.
                  </p>
                </div>
              </div>
              <button
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                type="button"
                onClick={() => setIsOpen(false)}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <form action={handleSubmit} className="space-y-4 px-5 py-4">
              <div>
                <label className="text-sm font-medium text-zinc-800" htmlFor="new-schema-version">
                  Version
                </label>
                <input
                  autoFocus
                  className="mt-2 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                  id="new-schema-version"
                  name="version"
                  placeholder={`e.g. ${nextVersionSuggestion(currentVersion)}`}
                  required
                  type="text"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-800" htmlFor="new-schema-attributes">
                  Attributes (one per line)
                </label>
                <textarea
                  className="mt-2 min-h-32 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-950"
                  defaultValue={currentAttributes.join("\n")}
                  id="new-schema-attributes"
                  name="attributes"
                  required
                />
              </div>

              {error ? <p className="text-sm text-rose-700">{error}</p> : null}

              <div className="flex justify-end gap-2">
                <button
                  className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  type="button"
                  onClick={() => setIsOpen(false)}
                >
                  Cancel
                </button>
                <SubmitButton />
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function nextVersionSuggestion(currentVersion: string) {
  const asNumber = Number(currentVersion);
  if (!Number.isNaN(asNumber)) {
    return String(asNumber + 1);
  }
  return `${currentVersion}.1`;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="h-9 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Creating..." : "Create version"}
    </button>
  );
}
