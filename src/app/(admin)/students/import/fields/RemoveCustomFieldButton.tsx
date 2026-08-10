/**
 * @fileoverview Provides the Remove Custom Field Button interaction on `/students/import/fields/RemoveCustomFieldButton.tsx`.
 * @module app/(admin)/students/import/fields/RemoveCustomFieldButton
 */

"use client";

import { useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { removeCustomFieldAction } from "./actions";

const buttonClassName =
  "h-9 rounded-md border border-danger-border bg-danger-bg px-3 text-sm font-medium text-danger-fg transition hover:bg-danger-border";

export function RemoveCustomFieldButton({
  fieldKey,
  requiresConfirmation,
  warning,
}: {
  fieldKey: string;
  requiresConfirmation: boolean;
  warning?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!requiresConfirmation) {
    return (
      <form action={removeCustomFieldAction}>
        <input name="key" type="hidden" value={fieldKey} />
        <input name="confirmed" type="hidden" value="false" />
        <button className={buttonClassName} type="submit">
          Remove
        </button>
      </form>
    );
  }

  return (
    <>
      <button className={buttonClassName} onClick={() => setIsOpen(true)} type="button">
        Remove
      </button>

      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="Remove custom field">
        <p className="text-sm text-fg-muted">{warning ?? "Remove this custom field?"}</p>
        <form action={removeCustomFieldAction} className="mt-4 flex justify-end gap-2">
          <input name="key" type="hidden" value={fieldKey} />
          <input name="confirmed" type="hidden" value="true" />
          <button
            className="h-9 rounded-md border border-border bg-surface px-3 text-sm font-medium text-fg-muted transition hover:border-border-strong hover:bg-surface-muted hover:text-fg"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-9 rounded-md bg-danger-fg px-3 text-sm font-medium text-white transition hover:opacity-90"
            type="submit"
          >
            Remove field
          </button>
        </form>
      </Dialog>
    </>
  );
}
