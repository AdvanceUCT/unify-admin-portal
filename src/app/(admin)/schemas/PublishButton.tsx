"use client";

import { Rocket, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

export function PublishButton({
  action,
  schemaId,
  schemaVersion,
  currentActiveVersion,
}: {
  action: (formData: FormData) => void | Promise<void>;
  schemaId: string;
  schemaVersion: string;
  currentActiveVersion: string | null;
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
      setError(err instanceof Error ? err.message : "Failed to publish schema version.");
    }
  }

  return (
    <>
      <button
        className="h-8 shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        Publish
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
            aria-describedby="publish-schema-description"
            aria-labelledby="publish-schema-title"
            aria-modal="true"
            className="w-full max-w-md rounded-lg border border-zinc-200 bg-white shadow-xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
              <div className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700">
                  <Rocket className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 id="publish-schema-title" className="font-semibold text-zinc-950">
                    Publish version {schemaVersion}?
                  </h2>
                  <p id="publish-schema-description" className="mt-1 text-sm text-zinc-600">
                    {currentActiveVersion
                      ? `This retires version ${currentActiveVersion} and makes version ${schemaVersion} the active schema. New credential issuance will use this version immediately.`
                      : `This makes version ${schemaVersion} the active schema. New credential issuance will use this version immediately.`}
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
              <input name="schemaId" type="hidden" value={schemaId} />

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

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="h-9 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Publishing..." : "Publish"}
    </button>
  );
}
